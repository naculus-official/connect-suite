// Polyfills (crypto.getRandomValues, TextEncoder, …) before anything else.
import "@walletconnect/react-native-compat";
import "./crypto-random-uuid";
import { registerRootComponent } from "expo";

import App from "./App";

registerRootComponent(App);
