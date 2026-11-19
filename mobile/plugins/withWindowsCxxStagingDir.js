const { withAppBuildGradle } = require("@expo/config-plugins");

const MARKER = "buildStagingDirectory \"C:/cxx\"";

// No Windows, o caminho espelhado pelo codegen do CMake (autolinked_build/.../node_modules/...)
// passa dos 260 caracteres do MAX_PATH mesmo com o projeto em um caminho curto, e o ninja falha
// com "mkdir ...: No such file or directory". Jogar o diretório de build nativo pra raiz do disco
// dá o espaço que falta. android/ é gerado (CNG), então isso precisa ser um plugin, não uma
// edição manual do build.gradle - do contrário some no próximo `expo prebuild`.
module.exports = function withWindowsCxxStagingDir(config) {
  return withAppBuildGradle(config, (config) => {
    if (config.modResults.contents.includes(MARKER)) return config;
    config.modResults.contents = config.modResults.contents.replace(
      /namespace\s+'[^']*'/,
      (match) =>
        `${match}\n\n` +
        `    if (org.gradle.internal.os.OperatingSystem.current().isWindows()) {\n` +
        `        externalNativeBuild {\n` +
        `            cmake {\n` +
        `                ${MARKER}\n` +
        `            }\n` +
        `        }\n` +
        `    }\n`
    );
    return config;
  });
};
