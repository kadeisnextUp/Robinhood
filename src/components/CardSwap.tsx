import React, {
  Children,
  cloneElement,
  forwardRef,
  isValidElement,
  ReactElement,
  ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  Easing,
  PanResponder,
  StyleSheet,
  TouchableOpacity,
  View,
  ViewStyle
} from 'react-native';

export interface CardSwapProps {
  width?: number;
  height?: number;
  cardDistance?: number;
  verticalDistance?: number;
  onCardClick?: (idx: number) => void;
  easing?: 'linear' | 'elastic';
  children: ReactNode;
}

export interface CardProps {
  customClass?: string;
  style?: ViewStyle;
  children?: ReactNode;
  onPress?: () => void;
}

export const Card = forwardRef<View, CardProps>(
  ({ customClass, style, children, onPress, ...rest }, ref) => (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onPress}
      style={[styles.card, style]}
      {...rest}
    >
      <View ref={ref} style={styles.cardInner}>
        {children}
      </View>
    </TouchableOpacity>
  )
);
Card.displayName = 'Card';

interface Slot {
  x: number;
  y: number;
  scale: number;
  zIndex: number;
}

const makeSlot = (
  i: number,
  distX: number,
  distY: number,
  total: number
): Slot => ({
  x: i * distX,
  y: -i * distY,
  scale: 1 - i * 0.05, // Simulate depth with scale
  zIndex: total - i,
});

const CardSwap: React.FC<CardSwapProps> = ({
  width = 300,
  height = 400,
  cardDistance = 40,
  verticalDistance = 50,
  onCardClick,
  easing = 'elastic',
  children,
}) => {
  const childArr = useMemo(
    () => Children.toArray(children) as ReactElement<CardProps>[],
    [children]
  );

  const total = childArr.length;

  // Create animated values for each card
  const animatedValues = useRef(
    childArr.map(() => ({
      x: new Animated.Value(0),
      y: new Animated.Value(0),
      scale: new Animated.Value(1),
      zIndex: 0,
    }))
  ).current;

  const [zIndices, setZIndices] = useState<number[]>(
    Array.from({ length: total }, (_, i) => total - i)
  );

  const order = useRef<number[]>(
    Array.from({ length: total }, (_, i) => i)
  );

  const isAnimating = useRef(false);

  // Initialize card positions
  useEffect(() => {
    if (animatedValues.length === 0 || total === 0) return;
    
    animatedValues.forEach((anim, i) => {
      const slot = makeSlot(i, cardDistance, verticalDistance, total);
      anim.x.setValue(slot.x);
      anim.y.setValue(slot.y);
      anim.scale.setValue(slot.scale);
      anim.zIndex = slot.zIndex;
    });
    setZIndices(animatedValues.map((a) => a.zIndex));
  }, [total, cardDistance, verticalDistance]);

  const easingFunction =
    easing === 'elastic'
      ? Easing.elastic(0.8) // Reduced bounciness for smoother feel
      : Easing.bezier(0.25, 0.1, 0.25, 1); // Smooth cubic bezier

  const animationDurations =
    easing === 'elastic'
      ? { drop: 600, move: 500, return: 500 } // Much faster
      : { drop: 500, move: 400, return: 400 };

  const swap = () => {
    if (order.current.length < 2 || isAnimating.current) return;

    isAnimating.current = true;
    const [front, ...rest] = order.current;
    const frontAnim = animatedValues[front];

    // Step 1: Drop front card down with rotation for more dynamic feel
    Animated.timing(frontAnim.y, {
      toValue: 500,
      duration: animationDurations.drop,
      easing: easingFunction,
      useNativeDriver: true,
    }).start();

    // Step 2: Promote other cards forward - start earlier for overlap
    setTimeout(() => {
      const moveAnimations = rest.map((idx, i) => {
        const anim = animatedValues[idx];
        const slot = makeSlot(i, cardDistance, verticalDistance, total);

        // Update zIndex
        anim.zIndex = slot.zIndex;

        return Animated.parallel([
          Animated.timing(anim.x, {
            toValue: slot.x,
            duration: animationDurations.move,
            easing: easingFunction,
            useNativeDriver: true,
          }),
          Animated.timing(anim.y, {
            toValue: slot.y,
            duration: animationDurations.move,
            easing: easingFunction,
            useNativeDriver: true,
          }),
          Animated.timing(anim.scale, {
            toValue: slot.scale,
            duration: animationDurations.move,
            easing: easingFunction,
            useNativeDriver: true,
          }),
        ]);
      });

      Animated.stagger(80, moveAnimations).start(); // Faster stagger

      // Update zIndices state for rendering
      setZIndices([...animatedValues.map((a) => a.zIndex)]);
    }, animationDurations.drop * 0.3); // Start sooner for more overlap

    // Step 3: Return front card to back
    setTimeout(() => {
      const backSlot = makeSlot(
        total - 1,
        cardDistance,
        verticalDistance,
        total
      );
      frontAnim.zIndex = backSlot.zIndex;

      Animated.parallel([
        Animated.timing(frontAnim.x, {
          toValue: backSlot.x,
          duration: animationDurations.return,
          easing: easingFunction,
          useNativeDriver: true,
        }),
        Animated.timing(frontAnim.y, {
          toValue: backSlot.y,
          duration: animationDurations.return,
          easing: easingFunction,
          useNativeDriver: true,
        }),
        Animated.timing(frontAnim.scale, {
          toValue: backSlot.scale,
          duration: animationDurations.return,
          easing: easingFunction,
          useNativeDriver: true,
        }),
      ]).start(() => {
        // Update order after animation completes
        order.current = [...rest, front];
        setZIndices([...animatedValues.map((a) => a.zIndex)]);
        isAnimating.current = false;
      });
    }, animationDurations.drop * 0.3 + animationDurations.move);
  };

  // Pan responder for swipe gestures
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Only activate if swiping left/up
        return Math.abs(gestureState.dx) > 10 || Math.abs(gestureState.dy) > 10;
      },
      onPanResponderRelease: (_, gestureState) => {
        // Swipe left or swipe up to trigger card swap
        if (gestureState.dx < -50 || gestureState.dy < -50) {
          swap();
        }
      },
    })
  ).current;

  const rendered = childArr.map((child, i) => {
    const animValue = animatedValues[i];

    return (
      <Animated.View
        key={i}
        style={[
          styles.cardContainer,
          {
            width,
            height,
            zIndex: zIndices[i],
            transform: [
              { translateX: animValue.x },
              { translateY: animValue.y },
              { scale: animValue.scale },
            ],
          },
        ]}
        {...(i === order.current[0] ? panResponder.panHandlers : {})}
      >
        {isValidElement<CardProps>(child)
          ? cloneElement(child, {
              style: { width, height, ...(child.props.style ?? {}) },
              onPress: () => {
                child.props.onPress?.();
                onCardClick?.(i);
              },
            } as CardProps)
          : child}
      </Animated.View>
    );
  });

  return (
    <View style={[styles.container, { width, height }]}>
      {rendered}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardContainer: {
    position: 'absolute',
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333',
    backgroundColor: '#1a1a1a',
    overflow: 'hidden',
    elevation: 5, // Android shadow
    shadowColor: '#000', // iOS shadow
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  cardInner: {
    flex: 1,
  },
});

export default CardSwap;