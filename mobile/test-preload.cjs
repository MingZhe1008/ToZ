const {createBridge}=require('./test-native.cjs');
globalThis.ToZAndroid=createBridge(process.env.TOZ_ANDROID_TEST_DIR);
