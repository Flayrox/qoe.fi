import React from 'react';
import { LoginFormBento } from '@qoe/ui';

export function LoginForm() {
  return (
    <div className="w-full max-w-[90%] xl:max-w-6xl mx-auto">
      <LoginFormBento showLanguageSwitch={true} />
    </div>
  );
}
