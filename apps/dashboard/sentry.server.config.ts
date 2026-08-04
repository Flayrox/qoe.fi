import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://fb83e77ffae2e4ea344526feae58cfcb@o4511716584456192.ingest.de.sentry.io/4511716589043792",

  // Adjust this value in production, or use tracesSampler for greater control
  tracesSampleRate: 1.0,

  // Setting this option to true will print useful information to the console system
  debug: false,
});
