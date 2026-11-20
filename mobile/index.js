import { registerRootComponent } from 'expo';
import { registerGlobals } from '@livekit/react-native';

// WebRTC nativo pro livekit-client (precisa vir antes de qualquer uso do LiveKit)
registerGlobals();

import { Platform } from 'react-native';
import App from './App';

// widget "Em call agora" do Android: o sistema chama isso pra desenhar/atualizar o widget
if (Platform.OS === 'android') {
  const { registerWidgetTaskHandler } = require('react-native-android-widget');
  const { widgetTaskHandler } = require('./src/widgets/widgetTaskHandler');
  registerWidgetTaskHandler(widgetTaskHandler);
}

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
