function activate(quartz) {
  quartz.log("First Native Test activated.");
  quartz.log("API version: " + quartz.apiVersion);
  quartz.log("Mod ID: " + quartz.mod.id);
  quartz.log("Mod Name: " + quartz.mod.name);

  const launches = quartz.storage.get("launches", 0) + 1;
  quartz.storage.set("launches", launches);

  quartz.log("Launch count: " + launches);

  return {
    ok: true,
    message: "First Native Test ran successfully."
  };
}

module.exports = activate;
module.exports.activate = activate;
