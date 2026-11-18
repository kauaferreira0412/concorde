package com.codagis.concorde.service;

import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.Inet6Address;
import java.net.InetAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Lê título/descrição/imagem (Open Graph) de um link pra mostrar o card de prévia no chat.
 * Seguro contra SSRF: só http/https, porta padrão, e nunca acessa IPs internos (checado em cada redirecionamento).
 */
@Service
public class LinkPreviewService {

    public record LinkPreview(String url, String title, String description, String image, String siteName) {}

    private static final int MAX_BYTES = 512 * 1024;
    private static final int MAX_REDIRECTS = 3;
    private static final Duration TTL = Duration.ofHours(6);
    private static final int MAX_CACHE = 1000;

    private static final Pattern META = Pattern.compile("<meta\\s+[^>]*>", Pattern.CASE_INSENSITIVE);
    private static final Pattern ATTR = Pattern.compile("([a-zA-Z:_-]+)\\s*=\\s*(\"([^\"]*)\"|'([^']*)')");
    private static final Pattern TITLE = Pattern.compile("<title[^>]*>([^<]{1,300})</title>", Pattern.CASE_INSENSITIVE);

    private record Cached(LinkPreview preview, Instant at) {}

    private final Map<String, Cached> cache = new LinkedHashMap<>(256, 0.75f, true) {
        @Override
        protected boolean removeEldestEntry(Map.Entry<String, Cached> eldest) {
            return size() > MAX_CACHE;
        }
    };

    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(4))
            .followRedirects(HttpClient.Redirect.NEVER)
            .build();

    public LinkPreview preview(String rawUrl) {
        URI uri = parse(rawUrl);
        String key = uri.toString();
        synchronized (cache) {
            Cached c = cache.get(key);
            if (c != null && c.at().plus(TTL).isAfter(Instant.now())) return c.preview();
        }
        LinkPreview result = isYoutube(uri) ? fetchYoutube(uri) : fetch(uri);
        synchronized (cache) {
            cache.put(key, new Cached(result, Instant.now()));
        }
        return result;
    }

    private static final Pattern YT_ID = Pattern.compile(
            "(?:youtube\\.com/(?:watch\\?(?:.*&)?v=|shorts/|embed/|live/)|youtu\\.be/)([\\w-]{6,})");

    private static boolean isYoutube(URI uri) {
        String host = uri.getHost().toLowerCase(Locale.ROOT);
        return (host.equals("youtu.be") || host.equals("youtube.com") || host.endsWith(".youtube.com"))
                && YT_ID.matcher(uri.toString()).find();
    }

    /** YouTube bloqueia/consente pra robôs; o oEmbed oficial devolve título, canal e miniatura sem isso. */
    private LinkPreview fetchYoutube(URI uri) {
        Matcher id = YT_ID.matcher(uri.toString());
        String videoId = id.find() ? id.group(1) : null;
        String thumb = videoId == null ? null : "https://i.ytimg.com/vi/" + videoId + "/hqdefault.jpg";
        try {
            URI oembed = URI.create("https://www.youtube.com/oembed?format=json&url="
                    + java.net.URLEncoder.encode("https://www.youtube.com/watch?v=" + videoId, StandardCharsets.UTF_8));
            HttpRequest req = HttpRequest.newBuilder(oembed).timeout(Duration.ofSeconds(6)).GET().build();
            HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
            if (res.statusCode() == 200) {
                var json = new com.fasterxml.jackson.databind.ObjectMapper().readTree(res.body());
                String title = json.path("title").asText(null);
                String author = json.path("author_name").asText(null);
                return new LinkPreview(uri.toString(), clip(title, 200), author == null ? null : clip(author, 120), thumb, "YouTube");
            }
        } catch (Exception ignored) {
            // cai no card sem título
        }
        return new LinkPreview(uri.toString(), "Vídeo do YouTube", null, thumb, "YouTube");
    }

    private URI parse(String rawUrl) {
        try {
            URI uri = URI.create(rawUrl.trim());
            String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
            if (!scheme.equals("http") && !scheme.equals("https")) throw new IllegalArgumentException();
            if (uri.getHost() == null) throw new IllegalArgumentException();
            if (uri.getPort() != -1 && uri.getPort() != 80 && uri.getPort() != 443) throw new IllegalArgumentException();
            return uri;
        } catch (Exception ex) {
            throw new IllegalArgumentException("Link inválido");
        }
    }

    private void assertPublicHost(String host) {
        try {
            for (InetAddress addr : InetAddress.getAllByName(host)) {
                if (addr.isAnyLocalAddress() || addr.isLoopbackAddress() || addr.isLinkLocalAddress()
                        || addr.isSiteLocalAddress() || addr.isMulticastAddress()
                        || (addr instanceof Inet6Address && (addr.getAddress()[0] & 0xfe) == 0xfc)
                        || addr.getHostAddress().startsWith("100.64.")
                        || addr.getHostAddress().startsWith("169.254.")) {
                    throw new IllegalArgumentException("Endereço não permitido");
                }
            }
        } catch (IllegalArgumentException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new IllegalArgumentException("Não deu pra acessar esse link");
        }
    }

    private LinkPreview fetch(URI start) {
        URI current = start;
        try {
            for (int hop = 0; hop <= MAX_REDIRECTS; hop++) {
                assertPublicHost(current.getHost());
                HttpRequest req = HttpRequest.newBuilder(current)
                        .timeout(Duration.ofSeconds(6))
                        .header("User-Agent", "Mozilla/5.0 (compatible; ConcordeLinkPreview/1.0)")
                        .header("Accept", "text/html,application/xhtml+xml")
                        .header("Accept-Language", "pt-BR,pt;q=0.9,en;q=0.8")
                        .GET()
                        .build();
                HttpResponse<InputStream> res = http.send(req, HttpResponse.BodyHandlers.ofInputStream());
                int code = res.statusCode();
                if (code >= 300 && code < 400) {
                    String location = res.headers().firstValue("location").orElse(null);
                    res.body().close();
                    if (location == null) break;
                    current = parse(current.resolve(location).toString());
                    continue;
                }
                String type = res.headers().firstValue("content-type").orElse("").toLowerCase(Locale.ROOT);
                if (code >= 400 || !type.contains("html")) {
                    res.body().close();
                    return empty(start);
                }
                String html = readLimited(res.body());
                return parseHtml(start, current, html);
            }
        } catch (IllegalArgumentException ex) {
            return empty(start);
        } catch (Exception ex) {
            return empty(start);
        }
        return empty(start);
    }

    private static String readLimited(InputStream in) throws Exception {
        try (in) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) != -1) {
                int room = MAX_BYTES - out.size();
                if (room <= 0) break;
                out.write(buf, 0, Math.min(n, room));
            }
            return out.toString(StandardCharsets.UTF_8);
        }
    }

    private LinkPreview parseHtml(URI original, URI finalUri, String html) {
        Map<String, String> meta = new LinkedHashMap<>();
        Matcher m = META.matcher(html);
        while (m.find()) {
            String tag = m.group();
            String key = null;
            String content = null;
            Matcher a = ATTR.matcher(tag);
            while (a.find()) {
                String name = a.group(1).toLowerCase(Locale.ROOT);
                String value = a.group(3) != null ? a.group(3) : a.group(4);
                if (name.equals("property") || name.equals("name")) key = value.toLowerCase(Locale.ROOT);
                else if (name.equals("content")) content = value;
            }
            if (key != null && content != null && !meta.containsKey(key)) meta.put(key, decode(content));
        }
        String title = first(meta, "og:title", "twitter:title");
        if (title == null) {
            Matcher t = TITLE.matcher(html);
            if (t.find()) title = decode(t.group(1)).trim();
        }
        String description = first(meta, "og:description", "twitter:description", "description");
        String image = first(meta, "og:image", "og:image:url", "twitter:image", "twitter:image:src");
        if (image != null) {
            try {
                image = finalUri.resolve(image).toString();
                if (!image.startsWith("https://") && !image.startsWith("http://")) image = null;
            } catch (Exception ex) {
                image = null;
            }
        }
        String site = first(meta, "og:site_name");
        if (site == null) site = original.getHost().replaceFirst("^www\\.", "");
        return new LinkPreview(original.toString(), clip(title, 200), clip(description, 300), image, clip(site, 80));
    }

    private static LinkPreview empty(URI uri) {
        return new LinkPreview(uri.toString(), null, null, null, uri.getHost().replaceFirst("^www\\.", ""));
    }

    private static String first(Map<String, String> meta, String... keys) {
        for (String k : keys) {
            String v = meta.get(k);
            if (v != null && !v.isBlank()) return v.trim();
        }
        return null;
    }

    private static String clip(String s, int max) {
        if (s == null) return null;
        return s.length() > max ? s.substring(0, max - 1) + "…" : s;
    }

    private static final Pattern NUMERIC_ENTITY = Pattern.compile("&#(x?)([0-9a-fA-F]{1,6});");

    /** Entidades HTML: as nomeadas mais comuns + numéricas (&#231; / &#xe7;), que sites como Instagram usam. */
    private static String decode(String s) {
        Matcher m = NUMERIC_ENTITY.matcher(s);
        StringBuilder sb = new StringBuilder();
        while (m.find()) {
            String rep;
            try {
                int cp = Integer.parseInt(m.group(2), m.group(1).isEmpty() ? 10 : 16);
                rep = new String(Character.toChars(cp));
            } catch (Exception ex) {
                rep = m.group();
            }
            m.appendReplacement(sb, Matcher.quoteReplacement(rep));
        }
        m.appendTail(sb);
        return sb.toString().replace("&quot;", "\"").replace("&apos;", "'").replace("&lt;", "<").replace("&gt;", ">")
                .replace("&nbsp;", " ").replace("&amp;", "&");
    }
}
