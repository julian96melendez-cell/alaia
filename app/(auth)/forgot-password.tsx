import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import Colors from "../../constants/Colors";

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Recuperar Contraseña</Text>
      <Text style={styles.subtitle}>Ingresa tu correo y te enviaremos instrucciones</Text>

      <TextInput
        placeholder="Correo electrónico"
        value={email}
        onChangeText={setEmail}
        style={styles.input}
        placeholderTextColor={Colors.light.textSecondary}
      />

      <TouchableOpacity style={styles.button} onPress={() => alert("Se han enviado las instrucciones a tu correo.")}>
        <Text style={styles.buttonText}>Enviar</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => router.back()}>
        <Text style={styles.link}>← Volver</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center", padding: 20, backgroundColor: Colors.light.background },
  title: { fontSize: 26, fontWeight: "bold", color: Colors.light.text, marginBottom: 10 },
  subtitle: { fontSize: 16, color: Colors.light.textSecondary, marginBottom: 30, textAlign: "center" },
  input: {
    width: "100%",
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 10,
    marginBottom: 15,
    backgroundColor: Colors.light.inputBackground,
    color: Colors.light.text,
  },
  button: {
    width: "100%",
    padding: 15,
    borderRadius: 10,
    backgroundColor: Colors.light.primary,
    alignItems: "center",
    marginBottom: 20,
  },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  link: { marginTop: 10, color: Colors.light.primary, fontWeight: "500" },
});