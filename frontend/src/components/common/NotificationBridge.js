import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useRouter, useRootNavigationState } from 'expo-router';
import { useAuth } from '../../context/AuthContext';
import { uuid } from '../../services/drafts/contracts';
import {
  nativePushAvailable,
  registerPush,
} from '../../services/notifications/device';
import { createNotificationService } from '../../services/notifications/service';
export default function NotificationBridge() {
  const { user, session, status } = useAuth(),
    router = useRouter();
  const navigation = useRootNavigationState();
  const [pending, setPending] = useState(/** @type {string|null} */ (null));
  useEffect(() => {
    if (!nativePushAvailable) return;
    let active = true;
    const subscriptions = /** @type {{remove:()=>void}[]} */ ([]);
    void import('expo-notifications')
      .then((n) => {
        if (!active) return;
        /** @param {import('expo-notifications').NotificationResponse|null} response */
        const handle = (response) => {
          const id =
            response?.notification.request.content.data?.notificationId;
          if (
            response?.actionIdentifier === n.DEFAULT_ACTION_IDENTIFIER &&
            typeof id === 'string' &&
            uuid.test(id)
          ) {
            setPending(id);
            n.clearLastNotificationResponse();
          }
        };
        subscriptions.push(n.addNotificationResponseReceivedListener(handle));
        handle(n.getLastNotificationResponse());
      })
      .catch(() => {});
    return () => {
      active = false;
      subscriptions.forEach((s) => s.remove());
    };
  }, []);
  useEffect(() => {
    if (!pending || !navigation?.key || status === 'restoring' || status === 'blocked') return;
    if (!user) {
      router.push('/login');
      return;
    }
    let active = true;
    void createNotificationService(session)
      .open(pending)
      .then((target) => {
        if (active) {
          setPending(null);
          router.push({
            pathname:
              target.targetType === 'received'
                ? '/mailboxes/received/[id]'
                : '/mailboxes/owned/[id]',
            params: { id: target.targetId },
          });
        }
      })
      .catch(() => {
        if (active) {
          setPending(null);
          router.push('/notifications');
        }
      });
    return () => {
      active = false;
    };
  }, [pending, router, session, status, user, navigation?.key]);
  useEffect(() => {
    if (!user || !nativePushAvailable) return;
    let active = true;
    const subs = /** @type {{remove:()=>void}[]} */ ([]);
    const sync = async () => {
      try {
        const p = await createNotificationService(session).preferences();
        if (active && p.pushAlerts && p.inAppAlerts)
          await registerPush(session);
      } catch {
        /* Next foreground retries registration, never a push send. */
      }
    };
    void sync();
    subs.push(
      AppState.addEventListener('change', (s) => {
        if (s === 'active') void sync();
      }),
    );
    void import('expo-notifications')
      .then((n) => {
        if (active)
          subs.push(
            n.addPushTokenListener(() => {
              void sync();
            }),
          );
      })
      .catch(() => {});
    return () => {
      active = false;
      subs.forEach((s) => s.remove());
    };
  }, [session, user]);
  return null;
}
