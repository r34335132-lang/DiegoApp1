import { View, ActivityIndicator } from "react-native";
import Colors from "@/constants/colors";

export default function Index() {
  return (
    <View style={{ flex: 1, backgroundColor: Colors.background, alignItems: "center", justifyContent: "center" }}>
      <ActivityIndicator color={Colors.primary} size="large" />
    </View>
  );
}
