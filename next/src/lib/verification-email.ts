import { signValue } from "./crypto-helpers";

/** Token payload is "accountEmail|newAddress" — emails cannot contain "|". */
export async function buildVerificationToken(
    accountEmail: string,
    newAddress: string,
    secret: string,
): Promise<string> {
    return signValue(`${accountEmail}|${newAddress}`, secret);
}

export interface SendVerificationOptions {
    accountEmail: string;
    newAddress: string;
    origin: string; // e.g. https://campwatch.dev — derived from the request URL
    resendApiKey: string;
    apiSecret: string;
}

/** Email the NEW address a confirmation link. Alerts only move after it's clicked. */
export async function sendVerificationEmail(opts: SendVerificationOptions): Promise<void> {
    const token = await buildVerificationToken(opts.accountEmail, opts.newAddress, opts.apiSecret);
    const verifyUrl = `${opts.origin}/api/me/verify-notification-email?token=${encodeURIComponent(token)}`;

    const html = `
<div style="font-family: Georgia, serif; max-width: 520px; margin: 0 auto; padding: 24px;">
    <h2 style="margin: 0 0 12px;">Confirm where CampWatch sends your alerts</h2>
    <p style="line-height: 1.5;">
        The CampWatch account <strong>${opts.accountEmail}</strong> asked to deliver its
        campsite alerts to this address. Click below to confirm — until then, alerts keep
        going to the login email.
    </p>
    <p style="margin: 24px 0;">
        <a href="${verifyUrl}"
           style="background:#1F3D2A;color:#F7F1E3;padding:12px 20px;text-decoration:none;border-radius:3px;font-weight:bold;">
            Send my alerts here
        </a>
    </p>
    <p style="font-size: 13px; color: #666; line-height: 1.5;">
        Didn't request this? Ignore the email and nothing changes.
    </p>
</div>`;

    const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${opts.resendApiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            from: "CampWatch <alerts@campwatch.dev>",
            to: opts.newAddress,
            subject: "Confirm your CampWatch alert address",
            html,
        }),
    });
    if (!response.ok) {
        throw new Error(`Resend returned ${response.status}`);
    }
}
