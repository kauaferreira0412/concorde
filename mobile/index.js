import { registerRootComponent } from 'expo';
import { registerGlobals } from '@livekit/react-native';

// WebRTC nativo pro livekit-client (precisa vir antes de qualquer uso do LiveKit)
registerGlobals();

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
