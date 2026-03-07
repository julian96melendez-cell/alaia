// components/CustomInput.tsx
import { Ionicons } from "@expo/vector-icons";
import React, {
    forwardRef,
    useEffect,
    useImperativeHandle,
    useMemo,
    useRef,
    useState,
} from "react";
import {
    Animated,
    Easing,
    NativeSyntheticEvent,
    StyleProp,
    StyleSheet,
    Text,
    TextInput,
    TextInputSubmitEditingEventData,
    TextStyle,
    TouchableOpacity,
    View,
    ViewStyle,
} from "react-native";
import useTheme from "../../hooks/useTheme";

/** Tipos de teclado admitidos por React Native */
export type KeyboardType =
  | "default"
  | "email-address"
  | "numeric"
  | "phone-pad"
  | "number-pad"
  | "decimal-pad"
  | "url"
  | "visible-password";

/** API expuesta por ref (imperativa) */
export interface CustomInputRef {
  focus: () => void;
  blur: () => void;
  clear: () => void;
  shake: () => void;
}

/** Props del input reutilizable */
export interface CustomInputProps {
  /** Valor y cambios */
  value: string;
  onChangeText: (text: string) => void;

  /** Etiquetas y contenido informativo */
  label?: string; // Label flotante
  placeholder?: string; // Placeholder cuando no hay label
  helperText?: string; // Texto auxiliar (debajo)

  /** Comportamiento */
  secureTextEntry?: boolean; // Modo password con eye toggle
  keyboardType?: KeyboardType;
  returnKeyType?: "done" | "go" | "next" | "search" | "send";
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  editable?: boolean;
  autoFocus?: boolean;

  /** Multilínea */
  multiline?: boolean;
  numberOfLines?: number;
  maxLength?: number;
  showCounter?: boolean; // Muestra contador "xx/max"

  /** Validación en tiempo real */
  validator?: (text: string) => string | null; // devuelve mensaje de error o null
  onValidate?: (isValid: boolean) => void;
  error?: string; // error externo (tiene prioridad)

  /** Adornos */
  icon?: keyof typeof Ionicons.glyphMap; // ícono a la izquierda
  allowClear?: boolean; // muestra botón "x" para limpiar
  leftAccessory?: React.ReactNode; // accesorio custom a la izquierda (sustituye icon)
  rightAccessory?: React.ReactNode; // accesorio custom a la derecha
  rightIcon?: keyof typeof Ionicons.glyphMap; // icono simple derecha
  onRightIconPress?: () => void;

  /** Estilos / accesibilidad */
  containerStyle?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
  style?: StyleProp<ViewStyle>; // alias de containerStyle
  testID?: string;
  accessibilityLabel?: string;

  /** Eventos extra */
  onSubmitEditing?: (
    e?: NativeSyntheticEvent<TextInputSubmitEditingEventData>
  ) => void;
  onBlur?: () => void;
  onFocus?: () => void;
}

const CustomInput = forwardRef<CustomInputRef, CustomInputProps>(
  (
    {
      value,
      onChangeText,

      label,
      placeholder,
      helperText,

      secureTextEntry = false,
      keyboardType = "default",
      returnKeyType = "done",
      autoCapitalize = "none",
      editable = true,
      autoFocus = false,

      multiline = false,
      numberOfLines = 1,
      maxLength,
      showCounter = false,

      validator,
      onValidate,
      error: externalError,

      icon,
      allowClear = true,
      leftAccessory,
      rightAccessory,
      rightIcon,
      onRightIconPress,

      containerStyle,
      inputStyle,
      style,
      testID,
      accessibilityLabel,

      onSubmitEditing,
      onBlur,
      onFocus,
    },
    ref
  ) => {
    const { theme } = useTheme();

    // Colores con fallback por si el tema no define alguna clave
    const C = {
      bg: theme.colors?.card ?? "#FFFFFF",
      text: theme.colors?.text ?? "#111827",
      textSecondary: theme.colors?.textSecondary ?? "#6B7280",
      primary: theme.colors?.primary ?? "#6C63FF",
      border: theme.colors?.border ?? "#E5E7EB",
      error: theme.colors?.error ?? "#EF4444",
    };

    const [isFocused, setFocused] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [internalError, setInternalError] = useState<string | null>(null);

    const inputRef = useRef<TextInput>(null);

    // ── Animaciones (label flotante, halo de foco, shake de error)
    const float = useRef(new Animated.Value(value ? 1 : 0)).current;
    const focusHalo = useRef(new Animated.Value(0)).current;
    const shake = useRef(new Animated.Value(0)).current;

    const hasValue = !!value;
    const error = externalError ?? internalError;
    const isValid = !error && hasValue;

    // API imperativa
    useImperativeHandle(ref, () => ({
      focus: () => inputRef.current?.focus(),
      blur: () => inputRef.current?.blur(),
      clear: () => onChangeText(""),
      shake: () => triggerShake(),
    }));

    // Label flotante
    useEffect(() => {
      Animated.timing(float, {
        toValue: isFocused || hasValue ? 1 : 0,
        duration: 180,
        easing: Easing.out(Easing.quad),
        useNativeDriver: false,
      }).start();
    }, [isFocused, hasValue, float]);

    // Halo de foco
    useEffect(() => {
      Animated.timing(focusHalo, {
        toValue: isFocused ? 1 : 0,
        duration: 180,
        easing: Easing.out(Easing.quad),
        useNativeDriver: false,
      }).start();
    }, [isFocused, focusHalo]);

    // Validación en tiempo real
    useEffect(() => {
      if (validator) {
        const msg = validator(value);
        setInternalError(msg);
        onValidate?.(!msg);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    // Shake si hay error
    useEffect(() => {
      if (!error) return;
      triggerShake();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [error]);

    const triggerShake = () => {
      shake.setValue(0);
      Animated.sequence([
        Animated.timing(shake, { toValue: 8, duration: 55, useNativeDriver: true }),
        Animated.timing(shake, { toValue: -8, duration: 55, useNativeDriver: true }),
        Animated.timing(shake, { toValue: 5, duration: 55, useNativeDriver: true }),
        Animated.timing(shake, { toValue: -5, duration: 55, useNativeDriver: true }),
        Animated.timing(shake, { toValue: 0, duration: 55, useNativeDriver: true }),
      ]).start();
    };

    // Derivados animados de label
    const labelY = float.interpolate({ inputRange: [0, 1], outputRange: [16, -8] });
    const labelScale = float.interpolate({ inputRange: [0, 1], outputRange: [1, 0.86] });

    // Colores dinámicos de borde
    const borderColor = useMemo(() => {
      if (error) return C.error;
      if (isFocused) return C.primary;
      return C.border;
    }, [error, isFocused, C.error, C.primary, C.border]);

    const iconTint = isFocused ? C.primary : C.textSecondary;

    // Handlers
    const handleFocus = () => {
      setFocused(true);
      onFocus?.();
    };
    const handleBlur = () => {
      setFocused(false);
      onBlur?.();
    };
    const handleClear = () => onChangeText("");

    const RightCluster = (
      <View style={styles.rowCenter}>
        {/* Estado de validación */}
        {isValid && !secureTextEntry && !rightAccessory && !rightIcon && (
          <Ionicons name="checkmark-circle" size={18} color="#10B981" style={styles.trailingIcon} />
        )}
        {error && (
          <Ionicons name="alert-circle" size={18} color={C.error} style={styles.trailingIcon} />
        )}

        {/* Limpiar */}
        {allowClear && hasValue && (
          <TouchableOpacity
            onPress={handleClear}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Limpiar"
          >
            <Ionicons name="close-circle" size={18} color={C.textSecondary} style={styles.trailingIcon} />
          </TouchableOpacity>
        )}

        {/* Toggle password */}
        {secureTextEntry && (
          <TouchableOpacity
            onPress={() => setShowPassword((s) => !s)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
          >
            <Ionicons
              name={showPassword ? "eye-off-outline" : "eye-outline"}
              size={20}
              color={C.textSecondary}
              style={styles.trailingIcon}
            />
          </TouchableOpacity>
        )}

        {/* Icono simple a la derecha */}
        {rightIcon && !rightAccessory && (
          <TouchableOpacity
            onPress={onRightIconPress}
            disabled={!onRightIconPress}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Acción"
          >
            <Ionicons name={rightIcon} size={20} color={C.textSecondary} style={styles.trailingIcon} />
          </TouchableOpacity>
        )}

        {/* Accesorio custom derecha */}
        {!!rightAccessory && <View style={styles.trailingIcon}>{rightAccessory}</View>}
      </View>
    );

    return (
      <Animated.View
        style={[
          styles.container,
          { transform: [{ translateX: shake }] },
          style || containerStyle,
        ]}
        testID={testID}
        accessibilityLabel={accessibilityLabel || label}
      >
        {/* Caja del input */}
        <View
          style={[
            styles.inputWrapper,
            {
              backgroundColor: C.bg,
              borderColor,
              shadowColor: C.primary,
            },
          ]}
        >
          {/* Halo sutil (borde/sombra) */}
          <Animated.View
            pointerEvents="none"
            style={[
              styles.focusHalo,
              {
                opacity: isFocused ? 0.1 : 0,
                backgroundColor: C.primary,
              },
            ]}
          />

          {/* Accesorio izquierda o icono */}
          <View style={styles.leadingWrap}>
            {leftAccessory ? (
              leftAccessory
            ) : icon ? (
              <Ionicons name={icon} size={20} color={iconTint} />
            ) : null}
          </View>

          {/* Contenido central */}
          <View style={styles.flex1}>
            {/* Label flotante */}
            {!!label && (
              <Animated.Text
                style={[
                  styles.floatingLabel,
                  {
                    color: C.textSecondary,
                    transform: [{ translateY: labelY }, { scale: labelScale }],
                  },
                ]}
                numberOfLines={1}
              >
                {label}
              </Animated.Text>
            )}

            {/* Input */}
            <TextInput
              ref={inputRef}
              style={[
                styles.input,
                { color: C.text, paddingTop: label ? 14 : 12 },
                multiline && { paddingTop: label ? 18 : 14, textAlignVertical: "top" },
                inputStyle,
              ]}
              value={value}
              onChangeText={onChangeText}
              placeholder={label ? undefined : placeholder}
              placeholderTextColor={C.textSecondary}
              secureTextEntry={secureTextEntry && !showPassword}
              keyboardType={keyboardType}
              returnKeyType={returnKeyType}
              autoCapitalize={autoCapitalize}
              editable={editable}
              autoFocus={autoFocus}
              multiline={multiline}
              numberOfLines={multiline ? numberOfLines : 1}
              maxLength={maxLength}
              onFocus={handleFocus}
              onBlur={handleBlur}
              onSubmitEditing={onSubmitEditing}
              accessibilityLabel={label || placeholder}
            />
          </View>

          {/* Cluster derecha */}
          {RightCluster}
        </View>

        {/* Helper / Error / Counter */}
        <View style={styles.helperRow}>
          <Text
            style={[
              styles.helperText,
              { color: error ? C.error : C.textSecondary },
            ]}
            numberOfLines={2}
          >
            {error ? error : helperText || " "}
          </Text>

          {showCounter && typeof maxLength === "number" && (
            <Text style={[styles.counter, { color: C.textSecondary }]}>
              {value.length}/{maxLength}
            </Text>
          )}
        </View>
      </Animated.View>
    );
  }
);

export default CustomInput;

/* ───────────────────────── estilos ───────────────────────── */
const styles = StyleSheet.create({
  container: { marginBottom: 18 },
  inputWrapper: {
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1.5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    elevation: 2,
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  focusHalo: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 14,
  },
  leadingWrap: {
    width: 24,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  flex1: { flex: 1, minHeight: 44, justifyContent: "center" },
  floatingLabel: {
    position: "absolute",
    left: 0,
    top: 0,
    fontSize: 12,
    fontWeight: "700",
  },
  input: {
    fontSize: 16,
    fontWeight: "500",
    paddingBottom: 10,
  },
  rowCenter: { flexDirection: "row", alignItems: "center" },
  trailingIcon: { marginLeft: 6 },
  helperRow: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  helperText: {
    fontSize: 12,
    fontWeight: "600",
    flex: 1,
    paddingRight: 8,
  },
  counter: {
    fontSize: 12,
    fontWeight: "600",
    opacity: 0.7,
  },
});