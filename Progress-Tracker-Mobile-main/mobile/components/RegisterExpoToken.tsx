import React, { useEffect } from 'react'
import { Alert, Platform } from 'react-native'
import * as Notifications from 'expo-notifications'
import Constants from 'expo-constants'

// Adjust BACKEND_URL if your backend runs on a different host or device.
const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:3001'

export default function RegisterExpoToken(): null {
  useEffect(() => {
    async function register() {
      try {
        const { status: existing } = await Notifications.getPermissionsAsync()
        let finalStatus = existing
        if (existing !== 'granted') {
          const { status } = await Notifications.requestPermissionsAsync()
          finalStatus = status
        }

        if (finalStatus !== 'granted') {
          Alert.alert('Notifications permission denied', 'Please enable notifications to receive push messages.')
          return
        }

        const tokenObj = await Notifications.getExpoPushTokenAsync()
        const token = tokenObj.data

        console.log('Obtained Expo push token:', token)
        Alert.alert('Expo push token (copied to console)', token)

        // POST to backend to persist as admin token
        const url = `${BACKEND_URL}/api/device-token`
        await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, role: 'admin' }),
        })

        console.log('Posted token to backend:', url)
      } catch (err) {
        console.error('Failed to register Expo push token', err)
        Alert.alert('Failed to register token', String(err))
      }
    }

    void register()
  }, [])

  return null
}
