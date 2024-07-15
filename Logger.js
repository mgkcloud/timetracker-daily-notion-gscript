function logger(level, message) {
  const timestamp = new Date().toISOString();
  console.log(`${timestamp} - ${level.toUpperCase()} - ${message}`);
}

function notifyUser(message) {
  MailApp.sendEmail(Session.getEffectiveUser().getEmail(), "Notion Update Script Notification", message);
}