import React, { useEffect, useRef } from 'react'
import { Alert, Linking, Platform } from 'react-native'
import * as Notifications from 'expo-notifications'
import * as LinkingExpo from 'expo-linking'
import * as Clipboard from 'expo-clipboard'

type NotificationResponse = Notifications.NotificationResponse

async function openWhatsAppIntent(phone: string, message: string) {
  const encoded = encodeURIComponent(message)
  const url = `whatsapp://send?phone=${phone}&text=${encoded}`

  try {
    const canOpen = await Linking.canOpenURL(url)
    if (canOpen) {
      await Linking.openURL(url)
      return
    }
  } catch (err) {
    // continue to fallback
  }

  // Fallback: WhatsApp not installed or cannot handle URL
  Alert.alert(
    'WhatsApp Not Installed',
    'WhatsApp is not available on this device. You can copy the message and paste it into WhatsApp.',
    [
      {
        text: 'Copy Message',
        onPress: async () => {
          await Clipboard.setStringAsync(message)
        },
      },
      { text: 'OK', style: 'cancel' },
    ],
  )
}

function extractPayloadData(response: NotificationResponse) {
  try {
    const data = response.notification.request.content.data as any
    return {
      type: data?.type,
      recipientPhone: data?.recipientPhone,
      whatsappMessage: data?.whatsappMessage,
      taskId: data?.taskId,
    }
  } catch (err) {
    return null
  }
}

export default function WhatsAppForwarder(): JSX.Element | null {
  const lastResponse = Notifications.useLastNotificationResponse()
  const handledRef = useRef<Set<string | null>>(new Set())

  async function handleResponse(response: NotificationResponse) {
    if (!response) return
    const payload = extractPayloadData(response)
    if (!payload) return
    if (payload.type !== 'WA_FORWARD_TRIGGER') return

    // Deduplicate by notification identifier or taskId
    const notificationId = response.notification.request.identifier ?? payload.taskId ?? null
    if (handledRef.current.has(notificationId)) return
    handledRef.current.add(notificationId)

    const phone = payload.recipientPhone
    const message = payload.whatsappMessage
    if (!phone || !message) return

    await openWhatsAppIntent(phone, message)
  }

  // Handle cold start (killed -> opened by tapping notification)
  useEffect(() => {
    if (lastResponse) {
      // run but don't block render
      void handleResponse(lastResponse)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastResponse])

  // Handle taps while app is foreground/background
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(response => {
      void handleResponse(response)
    })
    return () => subscription.remove()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}
