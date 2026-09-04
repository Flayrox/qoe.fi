import { Platform } from 'react-native';
import { NativeArticleBodyAndroid } from './NativeArticleBody.android';
import { NativeArticleBodyIOS } from './NativeArticleBody.ios';
import type { NativeArticleBodyProps } from './NativeArticleBody.types';

export function NativeArticleBody(props: NativeArticleBodyProps) {
  if (Platform.OS === 'android') {
    return <NativeArticleBodyAndroid {...props} />;
  }
  if (Platform.OS === 'ios') {
    return <NativeArticleBodyIOS {...props} />;
  }
  return null;
}

export * from './NativeArticleBody.types';
