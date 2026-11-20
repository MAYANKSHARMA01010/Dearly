import { useEffect, useState } from "react";
import { View } from "react-native";
import { Text } from "react-native-paper";
import { useAuth } from "../../context/AuthContext";
import { useAsyncAction } from "../../hooks/useAsyncAction";
import { parseEmailChallenge } from "../../services/auth/emailVerification";
import { spacing } from "../../theme";
import { InlineNotice } from "../layout/ScreenSections";
import AppButton from "../common/AppButton";
import AppTextField from "./AppTextField";

export default function EmailVerificationForm() {
  const { user, session } = useAuth(),
    action = useAsyncAction();
  const [challenge, setChallenge] = useState(
    /** @type {ReturnType<typeof parseEmailChallenge>|null} */ (null),
  );
  const [code, setCode] = useState(""),
    [now, setNow] = useState(() => Date.now()),
    [notice, setNotice] = useState("");
  useEffect(() => {
    if (!challenge) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [challenge]);
  if (user?.emailVerifiedAt)
    return (
      <Text accessibilityRole="text">
        Email verified. Delivered messages sent to this address can appear in
        Received.
      </Text>
    );
  const seconds = challenge
    ? Math.max(0, Math.ceil((challenge.resendAt - now) / 1000))
    : 0;
  const expired = !!challenge && Date.parse(challenge.expiresAt) <= now;
  const request = () => {
    setNotice("");
    void action.run(async (signal) => {
      const c = parseEmailChallenge(
        await session.request("/auth/email/request", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
          signal,
        }),
      );
      if (signal.aborted) return;
      setChallenge(c);
      setCode("");
      setNow(Date.now());
      setNotice(
        "Check your email for a six-digit code. It expires in five minutes.",
      );
    });
  };
  const verify = () => {
    void action.run(async (signal) => {
      if (!challenge) return;
      await session.request("/auth/email/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId: challenge.id, code }),
        signal,
      });
      if (!signal.aborted) await session.loadProfile();
    });
  };
  return (
    <View style={{ gap: spacing.sm }}>
      <Text>
        Email not verified. Verify it to see matching delivered messages in
        Received. You always sign in with your phone; WhatsApp is the first
        choice for login codes.
      </Text>
      <AppButton
        mode="outlined"
        icon="email-check-outline"
        onPress={request}
        disabled={action.busy || seconds > 0}
        loading={action.busy && !code}
      >
        {seconds > 0
          ? `Resend code in ${seconds}s`
          : challenge
            ? "Resend email code"
            : "Send email verification code"}
      </AppButton>
      {challenge ? (
        <>
          <AppTextField
            label="Email verification code"
            value={code}
            onChangeText={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            maxLength={6}
            disabled={action.busy || expired}
          />
          {expired ? (
            <InlineNotice error>
              Code expired. Request a new email code.
            </InlineNotice>
          ) : null}
          <AppButton
            mode="contained"
            onPress={verify}
            disabled={action.busy || expired || code.length !== 6}
            loading={action.busy && code.length === 6}
          >
            Verify email
          </AppButton>
        </>
      ) : null}
      {notice ? <InlineNotice>{notice}</InlineNotice> : null}
      {action.error ? <InlineNotice error>{action.error}</InlineNotice> : null}
    </View>
  );
}
