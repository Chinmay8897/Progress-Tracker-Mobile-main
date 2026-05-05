import { Redirect } from "expo-router";
import { useApp } from "@/context/AppContext";

export default function IndexRedirect() {
  const { currentUser, loading } = useApp();
  if (loading) return null;
  if (!currentUser) return <Redirect href="/login" />;
  return <Redirect href="/(tabs)" />;
}
