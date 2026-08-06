// =====================================================================
// 📦 @qoe/config — Re-exports
// =====================================================================
// Point d'entrée unique pour importer depuis les apps :
//   import { env, ROLES, features } from '@qoe/config';
// =====================================================================

export * from "./constants";
export * from "./features";
export * from "./routes";
export { env, parseEnv } from "./env";
