'use strict';

function managedRecoveryActionId(taskId) {
  taskId = taskId == null ? '' : String(taskId).slice(0, 120);
  return taskId ? 'team.delegate_managed:' + taskId : '';
}

module.exports = { managedRecoveryActionId };
