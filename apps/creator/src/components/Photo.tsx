import { Image, StyleSheet, View } from 'react-native'
import { colors } from './ui'

export function Photo({ uri, size = 72, testID }: { uri?: string; size?: number; testID?: string }) {
  return (
    <View style={[styles.box, { width: size, height: size }]} testID={testID}>
      {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityIgnoresInvertColors /> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  box: { borderRadius: 8, overflow: 'hidden', backgroundColor: colors.sand },
})
