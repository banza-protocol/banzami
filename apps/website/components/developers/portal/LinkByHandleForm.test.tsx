// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { LinkByHandleForm } from './LinkByHandleForm';

// Path B OTP phase isolation (ADR-060 §6). Each OTP challenge is a distinct
// security ceremony: BUSINESS_CONTACT_VERIFY and BUSINESS_PROJECT_LINK must never
// share visible OTP state. The live standalone-owner E2E (2026-10-08) surfaced the
// exact bug these tests lock down — the enrolment digits lingered in the six boxes
// after the flow moved to the link step, so the user had to clear them by hand.

const startLink = vi.fn();
const startEnrol = vi.fn();
const confirmEnrol = vi.fn();
const confirmLink = vi.fn();
vi.mock('@/lib/developer-api', async (orig) => {
  const real = await orig<typeof import('@/lib/developer-api')>();
  return {
    ...real,
    developerApi: {
      startBusinessLinkByHandle: (...a: unknown[]) => startLink(...a),
      startBusinessContactEnrolment: (...a: unknown[]) => startEnrol(...a),
      confirmBusinessContactEnrolment: (...a: unknown[]) => confirmEnrol(...a),
      confirmBusinessLinkByHandle: (...a: unknown[]) => confirmLink(...a),
    },
  };
});

beforeEach(() => {
  startLink.mockReset();
  startEnrol.mockReset();
  confirmEnrol.mockReset();
  confirmLink.mockReset();
});
afterEach(cleanup);

function renderForm() {
  return render(<LinkByHandleForm projectId="p1" csrf="x" onCancel={() => {}} onLinked={() => {}} />);
}

function typeDigits(code: string) {
  code.split('').forEach((d, i) => {
    fireEvent.change(screen.getByTestId(`otp-box-${i}`), { target: { value: d } });
  });
}

function boxes() {
  return Array.from({ length: 6 }, (_, i) => screen.getByTestId(`otp-box-${i}`) as HTMLInputElement);
}

// Walk the form from @banza entry, through enrolment, into the enrolVerify step.
async function advanceToEnrolVerify() {
  fireEvent.change(screen.getByTestId('link-handle-input'), { target: { value: 'doa' } });
  fireEvent.click(screen.getByTestId('link-by-handle-go'));
  const send = await screen.findByTestId('link-enrol-send');
  fireEvent.click(send);
  await screen.findByTestId('otp-box-0');
}

describe('LinkByHandleForm OTP phase isolation', () => {
  it('clears the OTP input moving from contact verification to link verification', async () => {
    // @doa has no verified contact yet → enrolment, then a distinct link challenge.
    startLink
      .mockResolvedValueOnce({ needs_contact: true })
      .mockResolvedValueOnce({ needs_contact: false, masked_email: 'c••••@doadoa.app' });
    startEnrol.mockResolvedValue({ masked_email: 'c••••@doadoa.app' });
    confirmEnrol.mockResolvedValue({ masked_email: 'c••••@doadoa.app' });

    renderForm();
    await advanceToEnrolVerify();

    // (2) enter the 6-digit enrolment code → (3) it auto-completes and verifies.
    typeDigits('828774');
    await waitFor(() => expect(confirmEnrol).toHaveBeenCalledTimes(1));

    // (4) the flow has moved to the BUSINESS_PROJECT_LINK step.
    await waitFor(() => expect(startLink).toHaveBeenCalledTimes(2));

    // (5) all six boxes are EMPTY — the enrolment code did not carry over.
    await waitFor(() => {
      for (const b of boxes()) expect(b.value).toBe('');
    });

    // (6) focus starts at the first box.
    expect(document.activeElement).toBe(screen.getByTestId('otp-box-0'));

    // (7) the previous code cannot be submitted from retained state: the submit
    // button is disabled and firing it never reaches the link confirmation.
    const confirm = screen.getByRole('button', { name: 'Confirmar' });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(confirm);
    expect(confirmLink).not.toHaveBeenCalled();
  });

  it('keeps digits during normal entry within the same challenge (no reset per keystroke)', async () => {
    startLink.mockResolvedValueOnce({ needs_contact: true });
    startEnrol.mockResolvedValue({ masked_email: 'c••••@doadoa.app' });

    renderForm();
    await advanceToEnrolVerify();

    // A partial code (not yet complete) must stay put as the user keeps typing.
    typeDigits('828');
    const [b0, b1, b2] = boxes();
    expect(b0.value).toBe('8');
    expect(b1.value).toBe('2');
    expect(b2.value).toBe('8');
    expect(confirmEnrol).not.toHaveBeenCalled();
  });

  it('shows an empty OTP input when a verified contact routes straight to the link step', async () => {
    // Different purpose from the start: @doa already verified → link challenge, no
    // enrolment. The boxes must be empty with focus on the first.
    startLink.mockResolvedValueOnce({ needs_contact: false, masked_email: 'c••••@doadoa.app' });

    renderForm();
    fireEvent.change(screen.getByTestId('link-handle-input'), { target: { value: 'doa' } });
    fireEvent.click(screen.getByTestId('link-by-handle-go'));

    await screen.findByTestId('otp-box-0');
    for (const b of boxes()) expect(b.value).toBe('');
    expect(document.activeElement).toBe(screen.getByTestId('otp-box-0'));
  });
});
