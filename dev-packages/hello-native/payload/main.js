module.exports.activate = function activate(quartz) {
  quartz.log('Hello Quartz Native activated.');
  quartz.log(`Runtime API version: ${quartz.apiVersion}`);
  quartz.log(`Mod ID: ${quartz.mod.id}`);
  quartz.log(`Mod Name: ${quartz.mod.name}`);

  return {
    ok: true,
    message: 'Hello Quartz Native ran successfully.'
  };
};
