/**
 * Validates whether a state transition is legal according to domain rules.
 * @param {Object} params
 * @param {string} params.currentStatus - Current status of the visit
 * @param {string} params.action - Action being attempted: 'SUBMIT', 'APPROVE', 'REJECT', 'COMPLETE'
 * @param {string} params.userRole - Role of the requesting user
 * @param {boolean} params.isCreator - Whether the requesting user is the one who created the visit
 * @param {string} [params.remarks] - Written remarks (required for rejection)
 */
function validateTransition({ currentStatus, action, userRole, isCreator, remarks }) {
  // 1. Submit or Resubmit: Moves DRAFT or REJECTED -> PENDING
  if (action === 'SUBMIT') {
    if (currentStatus !== 'DRAFT' && currentStatus !== 'REJECTED') {
      return { valid: false, error: `Cannot submit a visit that is currently ${currentStatus}` };
    }
    if (!isCreator) {
      return { valid: false, error: 'Only the officer who created the visit can submit it' };
    }
    return { valid: true, nextStatus: 'PENDING' };
  }

  // 2. Approve: Moves PENDING -> APPROVED
  if (action === 'APPROVE') {
    if (currentStatus !== 'PENDING') {
      return { valid: false, error: `Cannot approve a visit that is currently ${currentStatus}` };
    }
    if (userRole !== 'HQ_APPROVER' && userRole !== 'ADMIN') {
      return { valid: false, error: 'Only approvers or admins can approve visits' };
    }
    if (isCreator) {
      return { valid: false, error: 'Approver cannot approve their own visit' };
    }
    return { valid: true, nextStatus: 'APPROVED' };
  }

  // 3. Reject: Moves PENDING -> REJECTED
  if (action === 'REJECT') {
    if (currentStatus !== 'PENDING') {
      return { valid: false, error: `Cannot reject a visit that is currently ${currentStatus}` };
    }
    if (userRole !== 'HQ_APPROVER' && userRole !== 'ADMIN') {
      return { valid: false, error: 'Only approvers or admins can reject visits' };
    }
    if (isCreator) {
      return { valid: false, error: 'Approver cannot reject their own visit' };
    }
    if (!remarks || !remarks.trim()) {
      return { valid: false, error: 'A written remark is mandatory when rejecting a visit' };
    }
    return { valid: true, nextStatus: 'REJECTED' };
  }

  // 4. Complete: Moves APPROVED -> COMPLETED
  if (action === 'COMPLETE') {
    if (currentStatus !== 'APPROVED') {
      return { valid: false, error: `Cannot complete a visit that is currently ${currentStatus}` };
    }
    if (!isCreator) {
      return { valid: false, error: 'Only the officer who created the visit can mark it as completed' };
    }
    return { valid: true, nextStatus: 'COMPLETED' };
  }

  return { valid: false, error: `Unknown action: ${action}` };
}

module.exports = { validateTransition };