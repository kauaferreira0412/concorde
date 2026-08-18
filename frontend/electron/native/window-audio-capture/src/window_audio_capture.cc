// Captura o audio de UM processo especifico (e sua arvore de processos filhos), usando a API
// "Process Loopback" do WASAPI (Windows 10 2004+/build 19041+) - a mesma tecnica que o Discord
// usa pra "so o audio dessa janela". Diferente do loopback normal (que pega o audio do SISTEMA
// INTEIRO, ja usado no compartilhamento de "Tela Inteira" - ver VoiceCallContext.jsx), esse
// aqui filtra por PID: so vem audio do processo dono da janela escolhida (e filhos dele).
//
// Fluxo (ver ActivateAudioInterfaceAsync na documentacao da Microsoft, ou o sample oficial
// "ApplicationLoopback" em microsoft/Windows-classic-samples):
//   1. Monta AUDIOCLIENT_ACTIVATION_PARAMS com o PID alvo (ActivationType = PROCESS_LOOPBACK).
//   2. ActivateAudioInterfaceAsync (assincrono - o resultado chega via callback COM,
//      ActivateHandler::ActivateCompleted, que sinaliza um evento).
//   3. Com o IAudioClient em maos, inicializa em modo loopback + captura eventada (o SO avisa
//      via evento do Windows toda vez que tem audio novo pra ler).
//   4. Loop numa thread dedicada: espera o evento, le os frames PCM (float32, 48kHz, estereo -
//      formato fixo, e' o unico suportado por esse modo), manda pro JS via ThreadSafeFunction.
//
// Se ActivateAudioInterfaceAsync falhar (ex: Windows mais antigo que 2004, ou uma build com
// algum problema nessa API especifica - ja vimos isso acontecer numa build Insider/Canary,
// mesmo com IMMDevice::Activate classico funcionando normalmente do lado), o erro e' reportado
// via onError e quem chamou (VoiceCallContext.jsx) cai de volta pra compartilhar a janela sem
// audio, sem travar nada - ver startElectronScreenShare.
//
// So compila no Windows (ver "conditions" no binding.gyp) - Mac/Linux nem tentam usar isso
// (ver electron/preload.cjs, so' expoe a funcionalidade quando process.platform === "win32").
#include <napi.h>
#include <windows.h>
#include <mmdeviceapi.h>
#include <audioclient.h>
#include <audioclientactivationparams.h>
#include <functiondiscoverykeys_devpkey.h>
#include <atomic>
#include <memory>
#include <thread>
#include <vector>

namespace {

// Handler da ativacao assincrona - so' existe pra receber o resultado do
// ActivateAudioInterfaceAsync (que sempre chama de volta numa thread interna do COM, nunca
// sincrono) e sinalizar um evento pra thread de captura continuar.
class ActivateHandler : public IActivateAudioInterfaceCompletionHandler {
 public:
  ActivateHandler() {
    event_ = CreateEventW(nullptr, TRUE, FALSE, nullptr);
    // ActivateAudioInterfaceAsync entrega o resultado numa thread interna do sistema (RPC),
    // fora da nossa apartment - sem um "free-threaded marshaler" o COM tenta fazer proxy entre
    // apartments pra entregar o callback. E' o mesmo padrao que o sample oficial da Microsoft
    // (ApplicationLoopback, via WRL::FtmBase) usa - ver QueryInterface abaixo.
    CoCreateFreeThreadedMarshaler(static_cast<IActivateAudioInterfaceCompletionHandler*>(this), &marshaler_);
  }
  ~ActivateHandler() {
    if (marshaler_) marshaler_->Release();
    if (client_) client_->Release();
    if (event_) CloseHandle(event_);
  }

  HRESULT STDMETHODCALLTYPE ActivateCompleted(IActivateAudioInterfaceAsyncOperation* operation) override {
    IUnknown* punk = nullptr;
    HRESULT hrActivate = E_FAIL;
    operation->GetActivateResult(&hrActivate, &punk);
    hr_ = hrActivate;
    if (SUCCEEDED(hrActivate) && punk) {
      punk->QueryInterface(IID_PPV_ARGS(&client_));
      punk->Release();
    }
    SetEvent(event_);
    return S_OK;
  }

  HRESULT STDMETHODCALLTYPE QueryInterface(REFIID riid, void** ppv) override {
    if (riid == __uuidof(IUnknown) || riid == __uuidof(IActivateAudioInterfaceCompletionHandler)) {
      *ppv = static_cast<IActivateAudioInterfaceCompletionHandler*>(this);
      AddRef();
      return S_OK;
    }
    if (riid == __uuidof(IMarshal) && marshaler_) {
      return marshaler_->QueryInterface(riid, ppv);
    }
    *ppv = nullptr;
    return E_NOINTERFACE;
  }
  ULONG STDMETHODCALLTYPE AddRef() override { return InterlockedIncrement(&ref_); }
  ULONG STDMETHODCALLTYPE Release() override {
    ULONG r = InterlockedDecrement(&ref_);
    if (r == 0) delete this;
    return r;
  }

  HANDLE event_ = nullptr;
  HRESULT hr_ = E_FAIL;
  IAudioClient* client_ = nullptr;

 private:
  LONG ref_ = 1;
  IUnknown* marshaler_ = nullptr;
};

// Formato fixo (unico suportado pelo modo de captura por processo - nao da pra usar
// GetMixFormat aqui, esse "dispositivo virtual" nao tem mixer de verdade).
constexpr WORD kChannels = 2;
constexpr DWORD kSampleRate = 48000;
constexpr WORD kBitsPerSample = 32; // float

std::atomic<bool> g_stopRequested{false};
std::thread g_captureThread;
Napi::ThreadSafeFunction g_onData;   // (Buffer chunk) -> void
Napi::ThreadSafeFunction g_onError;  // (string message) -> void
std::atomic<bool> g_running{false};

WAVEFORMATEX MakeFormat() {
  WAVEFORMATEX wfx{};
  wfx.wFormatTag = WAVE_FORMAT_IEEE_FLOAT;
  wfx.nChannels = kChannels;
  wfx.nSamplesPerSec = kSampleRate;
  wfx.wBitsPerSample = kBitsPerSample;
  wfx.nBlockAlign = (WORD)(wfx.nChannels * wfx.wBitsPerSample / 8);
  wfx.nAvgBytesPerSec = wfx.nSamplesPerSec * wfx.nBlockAlign;
  wfx.cbSize = 0;
  return wfx;
}

std::string HrHex(HRESULT hr) {
  char buf[16];
  snprintf(buf, sizeof(buf), "0x%08X", (unsigned int)hr);
  return std::string(buf);
}

void ReportError(const std::string& message) {
  if (!g_onError) return;
  auto msg = std::make_shared<std::string>(message);
  g_onError.NonBlockingCall([msg](Napi::Env env, Napi::Function jsCallback) {
    jsCallback.Call({Napi::String::New(env, *msg)});
  });
}

void CaptureThreadProc(DWORD pid) {
  HRESULT hrCo = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
  bool comInitialized = SUCCEEDED(hrCo);

  AUDIOCLIENT_ACTIVATION_PARAMS params{};
  params.ActivationType = AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK;
  params.ProcessLoopbackParams.TargetProcessId = pid;
  // INCLUDE_TARGET_PROCESS_TREE: pega tambem processos filhos (ex: um app que abre
  // subprocessos de renderizacao/audio - Electron/Chrome fazem isso, entre outros).
  params.ProcessLoopbackParams.ProcessLoopbackMode = PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE;

  PROPVARIANT propVariant;
  PropVariantInit(&propVariant);
  propVariant.vt = VT_BLOB;
  propVariant.blob.cbSize = sizeof(params);
  propVariant.blob.pBlobData = reinterpret_cast<BYTE*>(&params);

  auto* handler = new ActivateHandler();
  IActivateAudioInterfaceAsyncOperation* asyncOp = nullptr;
  HRESULT hr = ActivateAudioInterfaceAsync(
      VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK, __uuidof(IAudioClient), &propVariant, handler, &asyncOp);

  if (FAILED(hr)) {
    ReportError("ActivateAudioInterfaceAsync falhou (" + HrHex(hr) +
                ") - essa API precisa do Windows 10 2004+ e pode nao estar disponivel nessa maquina/build");
    handler->Release();
    if (comInitialized) CoUninitialize();
    g_running = false;
    return;
  }

  WaitForSingleObject(handler->event_, INFINITE);
  if (asyncOp) asyncOp->Release();

  if (FAILED(handler->hr_) || !handler->client_) {
    ReportError("Nao foi possivel ativar a captura de audio desse processo (" + HrHex(handler->hr_) + ")");
    handler->Release();
    if (comInitialized) CoUninitialize();
    g_running = false;
    return;
  }

  IAudioClient* audioClient = handler->client_;
  WAVEFORMATEX wfx = MakeFormat();

  // 20ms de buffer (200000 * 100ns) - baixa latencia sem gerar overhead de callback excessivo.
  hr = audioClient->Initialize(AUDCLNT_SHAREMODE_SHARED,
                                AUDCLNT_STREAMFLAGS_LOOPBACK | AUDCLNT_STREAMFLAGS_EVENTCALLBACK,
                                200000, 0, &wfx, nullptr);
  if (FAILED(hr)) {
    ReportError("IAudioClient::Initialize falhou (" + HrHex(hr) + ")");
    handler->Release();
    if (comInitialized) CoUninitialize();
    g_running = false;
    return;
  }

  HANDLE audioEvent = CreateEventW(nullptr, FALSE, FALSE, nullptr);
  audioClient->SetEventHandle(audioEvent);

  IAudioCaptureClient* captureClient = nullptr;
  hr = audioClient->GetService(IID_PPV_ARGS(&captureClient));
  if (FAILED(hr) || !captureClient) {
    ReportError("GetService(IAudioCaptureClient) falhou (" + HrHex(hr) + ")");
    CloseHandle(audioEvent);
    handler->Release();
    if (comInitialized) CoUninitialize();
    g_running = false;
    return;
  }

  audioClient->Start();
  g_running = true;

  while (!g_stopRequested.load()) {
    DWORD waitResult = WaitForSingleObject(audioEvent, 500);
    if (waitResult != WAIT_OBJECT_0) continue;

    UINT32 packetLength = 0;
    hr = captureClient->GetNextPacketSize(&packetLength);
    while (SUCCEEDED(hr) && packetLength > 0 && !g_stopRequested.load()) {
      BYTE* data = nullptr;
      UINT32 numFrames = 0;
      DWORD flags = 0;
      hr = captureClient->GetBuffer(&data, &numFrames, &flags, nullptr, nullptr);
      if (FAILED(hr)) break;

      size_t byteCount = (size_t)numFrames * wfx.nBlockAlign;
      auto chunk = std::make_shared<std::vector<uint8_t>>(byteCount);
      if (flags & AUDCLNT_BUFFERFLAGS_SILENT) {
        std::fill(chunk->begin(), chunk->end(), 0);
      } else if (byteCount > 0) {
        memcpy(chunk->data(), data, byteCount);
      }
      captureClient->ReleaseBuffer(numFrames);

      if (g_onData && byteCount > 0) {
        g_onData.NonBlockingCall([chunk](Napi::Env env, Napi::Function jsCallback) {
          Napi::Buffer<uint8_t> buf = Napi::Buffer<uint8_t>::Copy(env, chunk->data(), chunk->size());
          jsCallback.Call({buf});
        });
      }

      hr = captureClient->GetNextPacketSize(&packetLength);
    }
  }

  audioClient->Stop();
  captureClient->Release();
  CloseHandle(audioEvent);
  handler->Release(); // libera tambem o IAudioClient (audioClient) via destrutor do handler
  if (comInitialized) CoUninitialize();
  g_running = false;
}

}  // namespace

// getPidForHwnd(hwnd: number) -> number
// Converte o HWND (que vem do id da fonte do desktopCapturer, ver ScreenSharePicker.jsx) pro
// PID do processo dono da janela - e' o processo que a gente pede pra capturar o audio.
Napi::Value GetPidForHwnd(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsNumber()) {
    Napi::TypeError::New(env, "hwnd (number) esperado").ThrowAsJavaScriptException();
    return env.Null();
  }
  HWND hwnd = reinterpret_cast<HWND>((intptr_t)info[0].As<Napi::Number>().Int64Value());
  DWORD pid = 0;
  GetWindowThreadProcessId(hwnd, &pid);
  return Napi::Number::New(env, (double)pid);
}

// startCapture(pid: number, onData: (chunk: Buffer) => void, onError: (msg: string) => void)
Napi::Value StartCapture(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (g_captureThread.joinable()) {
    Napi::Error::New(env, "Captura de audio ja em andamento - chame stopCapture() primeiro").ThrowAsJavaScriptException();
    return env.Undefined();
  }
  if (info.Length() < 3 || !info[0].IsNumber() || !info[1].IsFunction() || !info[2].IsFunction()) {
    Napi::TypeError::New(env, "esperado (pid: number, onData: function, onError: function)").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  DWORD pid = (DWORD)info[0].As<Napi::Number>().Uint32Value();
  g_onData = Napi::ThreadSafeFunction::New(env, info[1].As<Napi::Function>(), "WindowAudioCaptureData", 0, 1);
  g_onError = Napi::ThreadSafeFunction::New(env, info[2].As<Napi::Function>(), "WindowAudioCaptureError", 0, 1);
  g_stopRequested = false;
  g_captureThread = std::thread(CaptureThreadProc, pid);
  return env.Undefined();
}

// stopCapture(): para a captura (assincrono internamente, nao trava a thread principal).
Napi::Value StopCapture(const Napi::CallbackInfo& info) {
  g_stopRequested = true;
  std::thread([]() {
    if (g_captureThread.joinable()) g_captureThread.join();
    if (g_onData) g_onData.Release();
    if (g_onError) g_onError.Release();
  }).detach();
  return info.Env().Undefined();
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("getPidForHwnd", Napi::Function::New(env, GetPidForHwnd));
  exports.Set("startCapture", Napi::Function::New(env, StartCapture));
  exports.Set("stopCapture", Napi::Function::New(env, StopCapture));
  return exports;
}

NODE_API_MODULE(window_audio_capture, Init)
