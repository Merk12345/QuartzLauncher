function activate(quartz) {
  quartz.log("Quartz Native Template activated.");
  quartz.log(`API version: ${quartz.apiVersion}`);
  quartz.log(`Mod ID: ${quartz.mod.id}`);
  quartz.log(`Mod Name: ${quartz.mod.name}`);

  const launches = quartz.storage.get("launches", 0) + 1;
  quartz.storage.set("launches", launches);

  quartz.log(`This template has run ${launches} time(s).`);

  return {
    ok: true,
    message: "Quartz Native Template ran successfully."
  };
}

module.exports = activate;
module.exports.activate = activate;
