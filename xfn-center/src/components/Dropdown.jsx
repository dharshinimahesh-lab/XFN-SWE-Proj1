import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

function normalizeOptions(options) {
  return options.map((option) => {
    if (option && typeof option === "object") {
      const value = option.value ?? option.label ?? "";
      return {
        value,
        label: String(option.label ?? value),
      };
    }

    return {
      value: option,
      label: String(option),
    };
  });
}

function valuesMatch(left, right) {
  return String(left) === String(right);
}

export default function Dropdown({ className = "", disabled = false, label, onChange, options = [], value }) {
  const componentId = useId();
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const normalizedOptions = useMemo(() => normalizeOptions(options), [options]);
  const selectedIndex = normalizedOptions.findIndex((option) => valuesMatch(option.value, value));
  const safeSelectedIndex = selectedIndex >= 0 ? selectedIndex : 0;
  const selectedOption = normalizedOptions[selectedIndex] || null;
  const [activeIndex, setActiveIndex] = useState(safeSelectedIndex);
  const isDisabled = disabled || normalizedOptions.length === 0;
  const activeOptionIndex = normalizedOptions.length ? Math.min(Math.max(activeIndex, 0), normalizedOptions.length - 1) : 0;

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    function handlePointerDown(event) {
      if (!rootRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isOpen]);

  function openMenu(nextActiveIndex = safeSelectedIndex) {
    setActiveIndex(nextActiveIndex);
    setIsOpen(true);
  }

  function selectOption(option) {
    if (!option) {
      return;
    }

    onChange(option.value);
    setIsOpen(false);
    buttonRef.current?.focus();
  }

  function moveActiveIndex(step) {
    setActiveIndex((current) => {
      const next = current + step;
      if (next < 0) {
        return normalizedOptions.length - 1;
      }
      if (next >= normalizedOptions.length) {
        return 0;
      }
      return next;
    });
  }

  function handleKeyDown(event) {
    if (isDisabled) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!isOpen) {
        openMenu();
        return;
      }
      moveActiveIndex(1);
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!isOpen) {
        openMenu();
        return;
      }
      moveActiveIndex(-1);
    }

    if (event.key === "Home") {
      event.preventDefault();
      openMenu(0);
    }

    if (event.key === "End") {
      event.preventDefault();
      openMenu(normalizedOptions.length - 1);
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!isOpen) {
        openMenu();
        return;
      }
      selectOption(normalizedOptions[activeOptionIndex]);
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setIsOpen(false);
    }
  }

  return (
    <div className={`dropdown ${isOpen ? "is-open" : ""} ${className}`} ref={rootRef}>
      <button
        aria-activedescendant={isOpen ? `${componentId}-option-${activeOptionIndex}` : undefined}
        aria-controls={`${componentId}-listbox`}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={label ? `${label}: ${selectedOption?.label || "None selected"}` : undefined}
        className="dropdown-trigger"
        disabled={isDisabled}
        onClick={() => (isOpen ? setIsOpen(false) : openMenu())}
        onKeyDown={handleKeyDown}
        ref={buttonRef}
        type="button"
      >
        <span className="dropdown-copy">
          {label ? <small className="dropdown-label">{label}</small> : null}
          <span className="dropdown-value">{selectedOption?.label || "None available"}</span>
        </span>
        <ChevronDown className="dropdown-chevron" size={17} />
      </button>

      {isOpen ? (
        <div className="dropdown-menu" id={`${componentId}-listbox`} role="listbox">
          {normalizedOptions.map((option, index) => {
            const isSelected = valuesMatch(option.value, value);
            const isActive = index === activeOptionIndex;

            return (
              <button
                aria-selected={isSelected}
                className={`dropdown-option ${isSelected ? "is-selected" : ""} ${isActive ? "is-active" : ""}`}
                id={`${componentId}-option-${index}`}
                key={`${option.value}-${option.label}`}
                onClick={() => selectOption(option)}
                onMouseEnter={() => setActiveIndex(index)}
                role="option"
                type="button"
              >
                <span className="dropdown-option-label">{option.label}</span>
                {isSelected ? <Check className="dropdown-check" size={16} /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
