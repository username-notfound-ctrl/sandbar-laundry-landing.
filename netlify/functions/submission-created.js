// netlify/functions/submission-created.js
//
// Auto-fires whenever ANY Netlify Form on this site is submitted — no webhook
// URL to configure, Netlify's file-naming convention wires the trigger itself.
// Docs: https://docs.netlify.com/functions/trigger-on-events/
//
// Sends a track-specific confirmation email via SendGrid, routed by the
// hidden `interest` field each form already sets (general / delivery /
// commercial) — NOT by form name, since every form on this site currently
// shares name="waitlist" and only the hidden `interest` value differs.
//
// SETUP REQUIRED before this works:
//   1. Confirm SENDGRID_API_KEY is set in Netlify -> Site settings ->
//      Environment variables, as ONE shared value across all deploy
//      contexts (Production especially — a per-context split is what
//      broke this the first time around).
//   2. Nothing else — this file's path is what registers the trigger;
//      Netlify picks it up automatically on the next deploy.

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
// info@ is the customer-facing inbox; admin@ is kept for internal/login use
// only, so replies should come from and go back to info@.
const FROM_EMAIL = process.env.FROM_EMAIL || "info@sandbarlaundryco.com";
const FROM_NAME = "Sandbar Laundry Co.";

const SIGNATURE = `Wash \u00b7 Drop \u00b7 Repeat

Talk soon,
Alexander Ducate
CEO | SANDBAR LAUNDRY CO.
Wash & Fold \u2022 Commercial Accounts \u2022 Same-Day Service
Office: 910-378-9436
www.sandbarlaundryco.com
info@sandbarlaundryco.com`;

const TEMPLATES = {
  general: {
    subject: "Thanks for Reaching Out to Sandbar Laundry Co.",
    body: (firstName) => `Hi ${firstName},

Thanks for getting in touch with Sandbar Laundry Co.! Your information came through safely, and we wanted to confirm we've got it.

Here's what happens next: a member of our team will personally review what you shared and follow up with you directly within 48 hours. If anything's urgent before then, just reply to this email or give us a call at 910-378-9436 \u2014 a real person will get back to you.

A little about us, in case we're new to you: Sandbar Laundry Co. is a veteran-owned, eco-friendly wash-and-fold service built around one simple idea \u2014 great laundry care shouldn't cost you your weekend. We handle the wash, you handle everything else.

${SIGNATURE}

P.S. \u2014 Want early access and exclusive perks when we open our doors? Ask us about the Founding Member Program.`,
  },

  delivery: {
    subject: "You're on the Sandbar Delivery Waitlist",
    body: (firstName) => `Hi ${firstName},

Thanks for your interest in Sandbar Premium \u2014 our pickup-and-delivery tier! You're on the list, and we'll reach out first as soon as it opens in your neighborhood, ahead of our general announcement.

In the meantime, our neighborhood Hub model (drop-off wash-and-fold) is launching first in Jacksonville \u2014 you're welcome to join that waitlist too at sandbarlaundryco.com if you'd rather not wait.

${SIGNATURE}`,
  },

  commercial: {
    subject: "Thanks for Your Interest in Sandbar Commercial Accounts",
    body: (firstName) => `Hi ${firstName},

Thanks for reaching out about a commercial account with Sandbar Laundry Co.! Your information came through safely, and we're glad to hear from you.

Here's what happens next: our team will personally review your submission and follow up directly within 48 hours with onboarding details and a custom quote based on your business's volume and needs. If anything's urgent before then, just reply to this email or call us at 910-378-9436 \u2014 a real person will get back to you.

A little about us: Sandbar Laundry Co. is a veteran-owned, eco-friendly wash-and-fold service based in Jacksonville, NC. We're currently finalizing our commercial account terms alongside our first Hub \u2014 you'll be among the first to know when commercial accounts officially open.

${SIGNATURE}`,
  },

  // Dormant for now: no live form currently sets interest="founding-member"
  // (the homepage's Founding Member pitch tags itself interest="general").
  // Kept here in case that ever changes — see note in the handoff message.
  "founding-member": {
    subject: "You're In! Welcome to the Sandbar Founding Member Program",
    body: (firstName) => `Hi ${firstName},

You're in! Thanks for joining the Sandbar Laundry Co. Founding Member Program \u2014 your spot is reserved based on when you signed up.

Here's what happens next: a member of our team will personally review your information and follow up with you directly within 48 hours to confirm the details. If anything's urgent before then, just reply to this email or call us at 910-378-9436 \u2014 a real person will get back to you.

As a Founding Member, you'll get a lifetime perk \u2014 every 6th wash free \u2014 the moment we're up and running, plus first access as we open in Jacksonville.

A little about us, in case we're new to you: Sandbar Laundry Co. is a veteran-owned, eco-friendly wash-and-fold service built around one simple idea \u2014 great laundry care shouldn't cost you your weekend. We handle the wash, you handle everything else.

${SIGNATURE}`,
  },
};

exports.handler = async (event) => {
  let parsed;
  try {
    parsed = JSON.parse(event.body);
  } catch (err) {
    console.error("Could not parse event body:", err);
    return { statusCode: 400, body: "Invalid payload" };
  }

  // Netlify has historically wrapped this under `.payload` for this trigger —
  // be defensive in case that ever changes on your account/runtime.
  const submission = parsed.payload || parsed;

  // Logs once per submission so the invocation log always shows the real
  // field names Netlify actually sent, for easy debugging.
  console.log("Submission payload:", JSON.stringify(submission));

  const data = submission.data || {};
  const toEmail = data.email || submission.email;
  const rawName = data.name || submission.name || "";
  const firstName = (submission.first_name || rawName.split(" ")[0] || "there").trim();

  // Routed by the hidden `interest` field each form sets. Falls back to
  // "general" for anything missing or unrecognized, rather than failing.
  const interest = (data.interest || "general").toLowerCase().trim();
  const track = TEMPLATES[interest] ? interest : "general";
  const template = TEMPLATES[track];

  if (!toEmail) {
    console.error("No email address found on submission:", submission);
    return { statusCode: 400, body: "No email address in submission" };
  }

  if (!SENDGRID_API_KEY) {
    console.error("SENDGRID_API_KEY is not set — cannot send confirmation email.");
    return { statusCode: 500, body: "Email service not configured" };
  }

  try {
    const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SENDGRID_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: toEmail }] }],
        from: { email: FROM_EMAIL, name: FROM_NAME },
        reply_to: { email: FROM_EMAIL, name: FROM_NAME },
        subject: template.subject,
        content: [{ type: "text/plain", value: template.body(firstName) }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("SendGrid error:", response.status, errText);
      return { statusCode: 502, body: "Failed to send confirmation email" };
    }

    console.log(`Confirmation sent to ${toEmail} (${track} track)`);
    return { statusCode: 200, body: "Confirmation email sent" };
  } catch (err) {
    console.error("Error sending email:", err);
    return { statusCode: 500, body: "Internal error" };
  }
};
