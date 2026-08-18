// Modulo nativo minusculo: so' converte HWND -> PID (GetWindowThreadProcessId), uma unica
// chamada Win32 simples e sempre confiavel (nunca foi essa parte que deu problema em toda a
// investigacao de audio - so' a ativacao WASAPI mais avancada). O id da fonte escolhida no
// ScreenSharePicker.jsx vem no formato "window:<hwnd>:0" (ver desktopCapturer no main.cjs) -
// esse HWND precisa virar PID pra process-audio-capture (ver package.json) saber qual
// processo capturar.
#include <napi.h>
#include <windows.h>

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

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("getPidForHwnd", Napi::Function::New(env, GetPidForHwnd));
  return exports;
}

NODE_API_MODULE(hwnd_utils, Init)
