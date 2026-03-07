import { StyleSheet, Text, View } from "react-native";

type Props = {
  label: string;
};

export default function StatusBadge({ label }: Props) {
  const color = getColor(label);

  return (
    <View style={[styles.badge, { backgroundColor: color.bg }]}>
      <Text style={[styles.text, { color: color.text }]}>
        {label}
      </Text>
    </View>
  );
}

function getColor(label: string) {
  const l = label.toLowerCase();

  if (l.includes("entregado")) return { bg: "#e6f7ec", text: "#1e7f43" };
  if (l.includes("enviado")) return { bg: "#e6f0ff", text: "#2457c5" };
  if (l.includes("prepar")) return { bg: "#fff6e6", text: "#a05a00" };
  if (l.includes("cancel")) return { bg: "#fdecea", text: "#b42318" };

  return { bg: "#f3f3f3", text: "#444" };
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 16,
  },
  text: {
    fontSize: 13,
    fontWeight: "600",
  },
});