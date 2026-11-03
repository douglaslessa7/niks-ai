import { useEffect, useState } from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';

// `text-wrap: balance` dos designs, que o RN não tem: se o texto quebrar em exatamente
// 2 linhas, reparte no espaço mais perto do meio para as duas ficarem do mesmo tamanho
// (em vez de uma linha cheia e uma palavra sozinha embaixo).
export default function BalancedText({ text, style, numberOfLines }: { text: string; style: StyleProp<TextStyle>; numberOfLines?: number }) {
  const [out, setOut] = useState(text);
  useEffect(() => setOut(text), [text]);
  return (
    <Text
      style={style}
      numberOfLines={numberOfLines}
      onTextLayout={(e) => {
        if (out !== text || e.nativeEvent.lines.length !== 2) return;
        const mid = text.length / 2;
        let cut = -1;
        for (let i = 0; i < text.length; i++) {
          if (text[i] === ' ' && (cut < 0 || Math.abs(i - mid) < Math.abs(cut - mid))) cut = i;
        }
        if (cut > 0) setOut(`${text.slice(0, cut)}\n${text.slice(cut + 1)}`);
      }}
    >
      {out}
    </Text>
  );
}
