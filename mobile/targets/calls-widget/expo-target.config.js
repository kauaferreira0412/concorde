/** Widget "Em call agora" da tela inicial do iPhone/iPad. */
/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: "widget",
  name: "CallsWidget",
  displayName: "Em call agora",
  bundleIdentifier: ".callswidget",
  deploymentTarget: "17.0",
  colors: {
    $widgetBackground: "#15122B",
    $accent: "#7C4DEB",
    cardBg: "#2A2550",
    textMain: "#F4F1FF",
    textMuted: "#B4ACD6",
    live: "#3DDC97",
    mint: "#6FE3CF",
  },
  entitlements: {
    "com.apple.security.application-groups": config.ios.entitlements["com.apple.security.application-groups"],
  },
});
