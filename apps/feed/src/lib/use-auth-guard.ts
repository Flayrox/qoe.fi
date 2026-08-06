export function useAuthGuard<U = unknown>(
  user: U | null | undefined,
  onLoginRequired: () => void
) {
  return function withAuthGuard<Args extends unknown[], Return>(
    action: (...args: Args) => Return
  ) {
    return (...args: Args): Return | void => {
      if (!user) {
        onLoginRequired();
        return;
      }
      return action(...args);
    };
  };
}

