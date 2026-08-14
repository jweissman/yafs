import { BackgroundDrivers } from "./BackgroundDrivers";

export function startAll(drivers: BackgroundDrivers) {
  drivers.refreshes.start();
  drivers.plugins.forEach((plugin) =>
    plugin.start ? plugin.start() : plugin.sync(),
  );
}

export function closeAll(drivers: BackgroundDrivers) {
  drivers.refreshes.close();
  drivers.plugins.forEach((plugin) => plugin.close());
}

export function syncAll(drivers: BackgroundDrivers) {
  drivers.plugins.forEach((plugin) => plugin.sync());
}

export function recoverAll(drivers: BackgroundDrivers) {
  return Promise.all(
    drivers.plugins
      .filter((plugin) => plugin.recover)
      .map((plugin) => plugin.recover!()),
  );
}
