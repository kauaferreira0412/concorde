{
  "targets": [
    {
      "target_name": "hwnd_utils",
      "sources": ["src/hwnd_utils.cc"],
      "include_dirs": ["<!@(node -p \"require('node-addon-api').include\")"],
      "dependencies": ["<!(node -p \"require('node-addon-api').gyp\")"],
      "defines": ["NAPI_CPP_EXCEPTIONS"],
      "cflags_cc": ["/EHsc"],
      "conditions": [["OS=='win'", { "msvs_settings": { "VCCLCompilerTool": { "ExceptionHandling": 1 } } }]]
    }
  ]
}
