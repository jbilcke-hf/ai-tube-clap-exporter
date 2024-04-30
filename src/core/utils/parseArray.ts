export function parseArray(text: string) {
  let array: string[] = []
  try {
    array = JSON.parse(text)
  } catch (err) {
    array = []
  }

  return array
}