import { NavigationContainer, DarkTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { ActivityIndicator, View } from "react-native";
import { useSession } from "@/hooks/useSession";
import { AuthScreen } from "@/screens/AuthScreen";
import { CaptureScreen } from "@/screens/CaptureScreen";
import { NotesFeedScreen } from "@/screens/NotesFeedScreen";
import { NoteDetailScreen } from "@/screens/NoteDetailScreen";
import { SearchScreen } from "@/screens/SearchScreen";

export type RootStackParamList = {
  Capture: undefined;
  NotesFeed: undefined;
  NoteDetail: { noteId: string };
  Search: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const { session, loading } = useSession();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#0b0b0f" }}>
        <ActivityIndicator color="#6c5ce7" />
      </View>
    );
  }

  if (!session) {
    return <AuthScreen />;
  }

  return (
    <NavigationContainer theme={DarkTheme}>
      <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: "#0b0b0f" }, headerTintColor: "#fff" }}>
        <Stack.Screen name="Capture" component={CaptureScreen} options={{ title: "Ramblbox" }} />
        <Stack.Screen name="NotesFeed" component={NotesFeedScreen} options={{ title: "Notes" }} />
        <Stack.Screen name="NoteDetail" component={NoteDetailScreen} options={{ title: "Note" }} />
        <Stack.Screen name="Search" component={SearchScreen} options={{ title: "Search" }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
