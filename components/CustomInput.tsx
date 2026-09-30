"use client";

import React, { forwardRef } from "react";

export interface CustomInputRef {
  focus: () => void;
  blur: () => void;
  clear: () => void;
  shake: () => void;
}

export interface CustomInputProps {
  value: string;
  onChangeText: (text: string) => void;
  label?: string;
  placeholder?: string;
  helperText?: string;
  secureTextEntry?: boolean;
  keyboardType?: string;
  returnKeyType?: string;
  autoCapitalize?: string;
  editable?: boolean;
  autoFocus?: boolean;
  multiline?: boolean;
  numberOfLines?: number;
  maxLength?: number;
  showCounter?: boolean;
  validator?: (text: string) => string | null;
  onValidate?: (isValid: boolean) => void;
  error?: string;
  allowClear?: boolean;
  containerStyle?: React.CSSProperties;
  inputStyle?: React.CSSProperties;
  style?: React.CSSProperties;
  testID?: string;
  accessibilityLabel?: string;
  onSubmitEditing?: () => void;
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
      editable = true,
      autoFocus = false,
      multiline = false,
      maxLength,
      showCounter = false,
      validator,
      onValidate,
      error: externalError,
      allowClear = true,
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
    const internalError = validator ? validator(value) : null;
    const error = externalError ?? internalError;

    React.useEffect(() => {
      onValidate?.(!error);
    }, [error, onValidate]);

    const inputRef = React.useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

    React.useImperativeHandle(ref, () => ({
      focus: () => inputRef.current?.focus(),
      blur: () => inputRef.current?.blur(),
      clear: () => onChangeText(""),
      shake: () => {},
    }));

    const commonProps = {
      value,
      placeholder: label ? undefined : placeholder,
      maxLength,
      autoFocus,
      disabled: !editable,
      onFocus,
      onBlur,
      "data-testid": testID,
      "aria-label": accessibilityLabel || label || placeholder || "input",
      style: {
        flex: 1,
        border: "none",
        outline: "none",
        background: "transparent",
        fontSize: 16,
        ...(inputStyle || {}),
      } as React.CSSProperties,
    };

    return (
      <div style={{ marginBottom: 18, ...(style || containerStyle) }}>
        {label ? (
          <label
            style={{
              display: "block",
              marginBottom: 6,
              fontSize: 12,
              fontWeight: 700,
              color: "#6b7280",
            }}
          >
            {label}
          </label>
        ) : null}

        <div
          style={{
            display: "flex",
            alignItems: multiline ? "flex-start" : "center",
            gap: 8,
            borderRadius: 14,
            border: `1.5px solid ${error ? "#ef4444" : "#e5e7eb"}`,
            padding: "10px 12px",
            background: "#fff",
          }}
        >
          {multiline ? (
            <textarea
              ref={inputRef as React.RefObject<HTMLTextAreaElement>}
              rows={4}
              {...commonProps}
              onChange={(e) => onChangeText(e.target.value)}
            />
          ) : (
            <input
              ref={inputRef as React.RefObject<HTMLInputElement>}
              type={secureTextEntry ? "password" : "text"}
              {...commonProps}
              onChange={(e) => onChangeText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSubmitEditing?.();
              }}
            />
          )}

          {allowClear && value ? (
            <button
              type="button"
              onClick={() => onChangeText("")}
              style={{
                border: "none",
                background: "transparent",
                cursor: "pointer",
                fontSize: 16,
                color: "#6b7280",
              }}
            >
              ×
            </button>
          ) : null}
        </div>

        <div
          style={{
            marginTop: 6,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 8,
          }}
        >
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: error ? "#ef4444" : "#6b7280",
              flex: 1,
            }}
          >
            {error || helperText || " "}
          </span>

          {showCounter && typeof maxLength === "number" ? (
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "#6b7280",
              }}
            >
              {value.length}/{maxLength}
            </span>
          ) : null}
        </div>
      </div>
    );
  }
);

CustomInput.displayName = "CustomInput";

export default CustomInput;