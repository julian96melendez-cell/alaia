import { Ionicons } from "@expo/vector-icons";
import {
    Dimensions,
    Image,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import useTheme from "../../hooks/useTheme";

const { width } = Dimensions.get("window");
const CARD_WIDTH = width * 0.45;

interface ProductCardProps {
  product: {
    id: string;
    name: string;
    price: number;
    image: string;
    brand?: string;
    description?: string;
  };
  onPress: () => void;
  onWishlist?: () => void;
}

export default function ProductCard({
  product,
  onPress,
  onWishlist,
}: ProductCardProps) {
  const { theme } = useTheme();

  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.card, { backgroundColor: theme.card }]}
      activeOpacity={0.9}
    >
      {/* Imagen del producto */}
      <View style={styles.imageContainer}>
        <Image
          source={{
            uri:
              product.image ||
              "https://cdn.pixabay.com/photo/2016/11/19/14/00/shoes-1838769_1280.jpg",
          }}
          style={styles.image}
        />
        <TouchableOpacity
          style={[styles.wishlistButton, { backgroundColor: theme.card }]}
          onPress={onWishlist}
        >
          <Ionicons name="heart-outline" size={20} color={theme.tint} />
        </TouchableOpacity>
      </View>

      {/* Info */}
      <View style={styles.info}>
        <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
          {product.name}
        </Text>
        <Text style={[styles.brand, { color: theme.subtext }]} numberOfLines={1}>
          {product.brand || "Marca genérica"}
        </Text>
        <Text style={[styles.price, { color: theme.tint }]}>
          ${product.price.toFixed(2)}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    borderRadius: 16,
    marginVertical: 10,
    marginHorizontal: 8,
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    overflow: "hidden",
  },
  imageContainer: {
    width: "100%",
    height: 150,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: "hidden",
    position: "relative",
  },
  image: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  wishlistButton: {
    position: "absolute",
    top: 10,
    right: 10,
    borderRadius: 20,
    padding: 6,
    elevation: 3,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 1 },
  },
  info: {
    padding: 10,
  },
  name: {
    fontSize: 15,
    fontWeight: "600",
  },
  brand: {
    fontSize: 13,
    marginVertical: 2,
  },
  price: {
    fontSize: 16,
    fontWeight: "700",
    marginTop: 6,
  },
});