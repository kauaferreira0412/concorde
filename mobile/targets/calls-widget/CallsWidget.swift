import SwiftUI
import WidgetKit

// MARK: - Dados (mesmo formato do GET /api/voice/active-calls)

private let appGroup = "group.com.codagis.concorde"

struct CallPerson: Codable, Hashable {
  let userId: Int?
  let username: String?
  let avatarUrl: String?
}

struct ActiveCall: Codable, Hashable {
  let channelId: Int
  let channelName: String
  let serverId: Int
  let serverName: String
  let serverIconUrl: String?
  let participants: [CallPerson]

  /// Link que abre o app direto nessa call (tratado no App.js).
  var link: URL {
    var c = URLComponents()
    c.scheme = "concorde"
    c.host = "call"
    c.path = "/\(channelId)"
    c.queryItems = [
      URLQueryItem(name: "name", value: channelName),
      URLQueryItem(name: "serverId", value: String(serverId)),
      URLQueryItem(name: "serverName", value: serverName),
    ]
    return c.url ?? URL(string: "concorde://")!
  }
}

struct CallsEntry: TimelineEntry {
  let date: Date
  let loggedIn: Bool
  let calls: [ActiveCall]
  let avatars: [String: Data]
}

// MARK: - Busca

struct CallsProvider: TimelineProvider {
  private var defaults: UserDefaults? { UserDefaults(suiteName: appGroup) }

  func placeholder(in context: Context) -> CallsEntry {
    CallsEntry(date: .now, loggedIn: true, calls: [
      ActiveCall(channelId: 1, channelName: "Sessão", serverId: 1, serverName: "Mesa de RPG", serverIconUrl: nil,
                 participants: [CallPerson(userId: 1, username: "kaio", avatarUrl: nil),
                                CallPerson(userId: 2, username: "ana", avatarUrl: nil)]),
    ], avatars: [:])
  }

  func getSnapshot(in context: Context, completion: @escaping (CallsEntry) -> Void) {
    if context.isPreview {
      completion(placeholder(in: context))
      return
    }
    Task { completion(await load()) }
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<CallsEntry>) -> Void) {
    Task {
      let entry = await load()
      // o iOS decide a frequência real; pedimos de novo em 15 min (o app também avisa quando abre)
      let next = Calendar.current.date(byAdding: .minute, value: 15, to: .now) ?? .now.addingTimeInterval(900)
      completion(Timeline(entries: [entry], policy: .after(next)))
    }
  }

  private func cachedCalls() -> [ActiveCall] {
    guard let raw = defaults?.string(forKey: "calls"), let data = raw.data(using: .utf8) else { return [] }
    return (try? JSONDecoder().decode([ActiveCall].self, from: data)) ?? []
  }

  private func load() async -> CallsEntry {
    guard let token = defaults?.string(forKey: "token"), !token.isEmpty,
          let api = defaults?.string(forKey: "apiUrl"),
          let url = URL(string: "\(api)/api/voice/active-calls") else {
      return CallsEntry(date: .now, loggedIn: false, calls: [], avatars: [:])
    }
    var calls = cachedCalls()
    var request = URLRequest(url: url, timeoutInterval: 8)
    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    if let result = try? await URLSession.shared.data(for: request),
       (result.1 as? HTTPURLResponse)?.statusCode == 200,
       let fresh = try? JSONDecoder().decode([ActiveCall].self, from: result.0) {
      calls = fresh
      defaults?.set(String(data: result.0, encoding: .utf8), forKey: "calls")
    }
    return CallsEntry(date: .now, loggedIn: true, calls: calls, avatars: await loadAvatars(calls))
  }

  /// Widget não carrega imagem da internet sozinho: baixa as fotos antes (no máximo 16, pequenas).
  private func loadAvatars(_ calls: [ActiveCall]) async -> [String: Data] {
    var urls: [String] = []
    for call in calls.prefix(4) {
      for p in call.participants.prefix(4) {
        if let u = p.avatarUrl, u.hasPrefix("http"), !urls.contains(u) { urls.append(u) }
      }
    }
    var out: [String: Data] = [:]
    await withTaskGroup(of: (String, Data?).self) { group in
      for u in urls.prefix(16) {
        group.addTask {
          guard let url = URL(string: u) else { return (u, nil) }
          guard let result = try? await URLSession.shared.data(for: URLRequest(url: url, timeoutInterval: 6)) else { return (u, nil) }
          return (u, CallsProvider.thumbnail(result.0))
        }
      }
      for await (u, data) in group { if let data { out[u] = data } }
    }
    return out
  }

  /// Reduz a foto (e pega só o 1º quadro do GIF) pra caber no limite de memória do widget.
  fileprivate static func thumbnail(_ data: Data) -> Data? {
    guard let image = UIImage(data: data) else { return nil }
    let size = CGSize(width: 72, height: 72)
    let renderer = UIGraphicsImageRenderer(size: size)
    let small = renderer.image { _ in image.draw(in: CGRect(origin: .zero, size: size)) }
    return small.jpegData(compressionQuality: 0.8)
  }
}

// MARK: - Visual

private struct AvatarView: View {
  let person: CallPerson
  let avatars: [String: Data]
  var size: CGFloat = 24

  var body: some View {
    Group {
      if let u = person.avatarUrl, let data = avatars[u], let img = UIImage(data: data) {
        Image(uiImage: img).resizable().scaledToFill()
      } else {
        ZStack {
          Color("$accent")
          Text(String((person.username ?? "?").prefix(1)).uppercased())
            .font(.system(size: size * 0.48, weight: .black))
            .foregroundStyle(.white)
        }
      }
    }
    .frame(width: size, height: size)
    .clipShape(RoundedRectangle(cornerRadius: size * 0.32, style: .continuous))
    .overlay(RoundedRectangle(cornerRadius: size * 0.32, style: .continuous).stroke(.black, lineWidth: 1.5))
  }
}

private struct CallRow: View {
  let call: ActiveCall
  let avatars: [String: Data]
  var compact = false

  var body: some View {
    Link(destination: call.link) {
      HStack(spacing: 8) {
        VStack(alignment: .leading, spacing: 1) {
          Text("🔊 \(call.channelName)")
            .font(.system(size: compact ? 13 : 14, weight: .black))
            .foregroundStyle(Color("textMain"))
            .lineLimit(1)
          Text("\(call.serverName) · \(call.participants.compactMap(\.username).joined(separator: ", "))")
            .font(.system(size: 11, weight: .bold))
            .foregroundStyle(Color("textMuted"))
            .lineLimit(1)
        }
        Spacer(minLength: 4)
        HStack(spacing: -6) {
          ForEach(call.participants.prefix(compact ? 2 : 4), id: \.self) { p in
            AvatarView(person: p, avatars: avatars, size: compact ? 22 : 24)
          }
          if call.participants.count > (compact ? 2 : 4) {
            Text("+\(call.participants.count - (compact ? 2 : 4))")
              .font(.system(size: 11, weight: .black))
              .foregroundStyle(Color("mint"))
              .padding(.leading, 9)
          }
        }
      }
      .padding(.horizontal, 10)
      .padding(.vertical, 7)
      .background(Color("cardBg"), in: RoundedRectangle(cornerRadius: 13, style: .continuous))
      .overlay(RoundedRectangle(cornerRadius: 13, style: .continuous).stroke(.black, lineWidth: 2))
    }
  }
}

/// Widget pequeno: a call mais cheia, com as fotos grandes.
private struct SmallView: View {
  let entry: CallsEntry

  var body: some View {
    if let call = entry.calls.first {
      VStack(alignment: .leading, spacing: 6) {
        HStack(spacing: 5) {
          Circle().fill(Color("live")).frame(width: 8, height: 8)
          Text("EM CALL").font(.system(size: 11, weight: .black)).foregroundStyle(Color("textMain"))
        }
        Text(call.channelName)
          .font(.system(size: 16, weight: .black))
          .foregroundStyle(Color("textMain"))
          .lineLimit(2)
        Text(call.serverName)
          .font(.system(size: 11, weight: .bold))
          .foregroundStyle(Color("textMuted"))
          .lineLimit(1)
        Spacer(minLength: 0)
        HStack(spacing: -7) {
          ForEach(call.participants.prefix(4), id: \.self) { p in AvatarView(person: p, avatars: entry.avatars, size: 30) }
        }
        if entry.calls.count > 1 {
          Text("+\(entry.calls.count - 1) call\(entry.calls.count > 2 ? "s" : "")")
            .font(.system(size: 10, weight: .bold))
            .foregroundStyle(Color("textMuted"))
        }
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
      .widgetURL(call.link)
    } else {
      EmptyStateView(entry: entry)
    }
  }
}

private struct EmptyStateView: View {
  let entry: CallsEntry

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      HStack(spacing: 5) {
        Circle().fill(Color("textMuted")).frame(width: 8, height: 8)
        Text("CONCORDE").font(.system(size: 11, weight: .black)).foregroundStyle(Color("textMain"))
      }
      Spacer(minLength: 0)
      Text(entry.loggedIn ? "Ninguém em call agora." : "Entre no app pra ver quem está em call.")
        .font(.system(size: 13, weight: .bold))
        .foregroundStyle(Color("textMuted"))
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
  }
}

/// Médio e grande: lista das calls (toque numa pra entrar).
private struct ListView: View {
  let entry: CallsEntry
  let maxRows: Int

  var body: some View {
    if entry.calls.isEmpty {
      EmptyStateView(entry: entry)
    } else {
      VStack(alignment: .leading, spacing: 6) {
        HStack(spacing: 6) {
          Circle().fill(Color("live")).frame(width: 9, height: 9)
          Text("EM CALL AGORA").font(.system(size: 12, weight: .black)).foregroundStyle(Color("textMain"))
          Spacer()
          Text(entry.date, style: .time).font(.system(size: 10, weight: .bold)).foregroundStyle(Color("textMuted"))
        }
        ForEach(entry.calls.prefix(maxRows), id: \.channelId) { call in
          CallRow(call: call, avatars: entry.avatars, compact: maxRows <= 2)
        }
        if entry.calls.count > maxRows {
          Text("e mais \(entry.calls.count - maxRows)...")
            .font(.system(size: 11, weight: .bold))
            .foregroundStyle(Color("textMuted"))
        }
        Spacer(minLength: 0)
      }
    }
  }
}

struct CallsWidgetView: View {
  @Environment(\.widgetFamily) private var family
  let entry: CallsEntry

  var body: some View {
    Group {
      switch family {
      case .systemSmall: SmallView(entry: entry)
      case .systemLarge, .systemExtraLarge: ListView(entry: entry, maxRows: 6)
      default: ListView(entry: entry, maxRows: 2)
      }
    }
    .containerBackground(Color("$widgetBackground"), for: .widget)
  }
}

struct CallsWidget: Widget {
  let kind = "CallsWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: CallsProvider()) { entry in
      CallsWidgetView(entry: entry)
    }
    .configurationDisplayName("Em call agora")
    .description("Quem está em call nos seus servidores. Toque pra entrar.")
    .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
  }
}
