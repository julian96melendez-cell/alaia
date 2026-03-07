import { StyleSheet } from "react-native";
import { Text, View } from "./Themed";

export default function EditScreenInfo({ path }: { path: string }) {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>
        Abre este archivo: <Text style={styles.path}>{path}</Text> para empezar a editar.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 20,
  },
  text: {
    fontSize: 16,
    lineHeight: 24,
    textAlign: "center",
  },
  path: {
    marginTop: 10,
    fontWeight: "bold",
  },
});