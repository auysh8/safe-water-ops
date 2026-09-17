const { validateTransition } = require('../src/utils/stateMachine');

describe('State Machine Domain Rule Tests (Section 2.3)', () => {
  // 1. Submit & Resubmit: DRAFT or REJECTED -> PENDING
  test('allows creator to submit draft visit', () => {
    const result = validateTransition({
      currentStatus: 'DRAFT',
      action: 'SUBMIT',
      userRole: 'FIELD_OFFICER',
      isCreator: true,
    });
    expect(result.valid).toBe(true);
    expect(result.nextStatus).toBe('PENDING');
  });

  test('allows creator to resubmit rejected visit', () => {
    const result = validateTransition({
      currentStatus: 'REJECTED',
      action: 'SUBMIT',
      userRole: 'FIELD_OFFICER',
      isCreator: true,
    });
    expect(result.valid).toBe(true);
    expect(result.nextStatus).toBe('PENDING');
  });

  test('blocks non-creator from submitting visit', () => {
    const result = validateTransition({
      currentStatus: 'DRAFT',
      action: 'SUBMIT',
      userRole: 'FIELD_OFFICER',
      isCreator: false,
    });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/only the officer who created/i);
  });

  test('blocks submitting a visit that is already PENDING, APPROVED, or COMPLETED', () => {
    ['PENDING', 'APPROVED', 'COMPLETED'].forEach((status) => {
      const result = validateTransition({
        currentStatus: status,
        action: 'SUBMIT',
        userRole: 'FIELD_OFFICER',
        isCreator: true,
      });
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/cannot submit/i);
    });
  });

  // 2. Approval: PENDING -> APPROVED
  test('allows approver to approve pending visit of another officer', () => {
    const result = validateTransition({
      currentStatus: 'PENDING',
      action: 'APPROVE',
      userRole: 'HQ_APPROVER',
      isCreator: false,
      remarks: 'Looks good',
    });
    expect(result.valid).toBe(true);
    expect(result.nextStatus).toBe('APPROVED');
  });

  test('allows admin to approve pending visit of another officer', () => {
    const result = validateTransition({
      currentStatus: 'PENDING',
      action: 'APPROVE',
      userRole: 'ADMIN',
      isCreator: false,
    });
    expect(result.valid).toBe(true);
    expect(result.nextStatus).toBe('APPROVED');
  });

  test('blocks approver from approving their own visit', () => {
    const result = validateTransition({
      currentStatus: 'PENDING',
      action: 'APPROVE',
      userRole: 'HQ_APPROVER',
      isCreator: true,
    });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/cannot approve their own/i);
  });

  test('blocks field officer from approving a visit', () => {
    const result = validateTransition({
      currentStatus: 'PENDING',
      action: 'APPROVE',
      userRole: 'FIELD_OFFICER',
      isCreator: false,
    });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/only approvers or admins/i);
  });

  test('blocks approving a non-PENDING visit', () => {
    ['DRAFT', 'APPROVED', 'REJECTED', 'COMPLETED'].forEach((status) => {
      const result = validateTransition({
        currentStatus: status,
        action: 'APPROVE',
        userRole: 'HQ_APPROVER',
        isCreator: false,
      });
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/cannot approve/i);
    });
  });

  // 3. Rejection: PENDING -> REJECTED
  test('allows approver to reject pending visit with valid remarks', () => {
    const result = validateTransition({
      currentStatus: 'PENDING',
      action: 'REJECT',
      userRole: 'HQ_APPROVER',
      isCreator: false,
      remarks: 'Estimated cost exceeds quarterly budget allocation.',
    });
    expect(result.valid).toBe(true);
    expect(result.nextStatus).toBe('REJECTED');
  });

  test('rejects pending visit when remarks are missing or whitespace only', () => {
    ['', '   ', null, undefined].forEach((emptyRemarks) => {
      const result = validateTransition({
        currentStatus: 'PENDING',
        action: 'REJECT',
        userRole: 'HQ_APPROVER',
        isCreator: false,
        remarks: emptyRemarks,
      });
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/mandatory/i);
    });
  });

  test('blocks approver from rejecting their own visit', () => {
    const result = validateTransition({
      currentStatus: 'PENDING',
      action: 'REJECT',
      userRole: 'HQ_APPROVER',
      isCreator: true,
      remarks: 'Rejecting my own',
    });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/cannot reject their own/i);
  });

  // 4. Completion: APPROVED -> COMPLETED
  test('allows creator to complete approved visit', () => {
    const result = validateTransition({
      currentStatus: 'APPROVED',
      action: 'COMPLETE',
      userRole: 'FIELD_OFFICER',
      isCreator: true,
    });
    expect(result.valid).toBe(true);
    expect(result.nextStatus).toBe('COMPLETED');
  });

  test('blocks non-creator from completing visit', () => {
    const result = validateTransition({
      currentStatus: 'APPROVED',
      action: 'COMPLETE',
      userRole: 'FIELD_OFFICER',
      isCreator: false,
    });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/only the officer who created/i);
  });

  test('blocks completing a visit not in APPROVED status', () => {
    ['DRAFT', 'PENDING', 'REJECTED', 'COMPLETED'].forEach((status) => {
      const result = validateTransition({
        currentStatus: status,
        action: 'COMPLETE',
        userRole: 'FIELD_OFFICER',
        isCreator: true,
      });
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/cannot complete/i);
    });
  });

  // 5. Terminal State COMPLETED
  test('forbids any transition out of COMPLETED', () => {
    ['SUBMIT', 'APPROVE', 'REJECT', 'COMPLETE'].forEach((action) => {
      const result = validateTransition({
        currentStatus: 'COMPLETED',
        action,
        userRole: 'ADMIN',
        isCreator: true,
        remarks: 'Trying to move terminal',
      });
      expect(result.valid).toBe(false);
    });
  });

  test('handles unknown actions gracefully', () => {
    const result = validateTransition({
      currentStatus: 'DRAFT',
      action: 'UNKNOWN_ACTION',
      userRole: 'FIELD_OFFICER',
      isCreator: true,
    });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/unknown action/i);
  });
});
