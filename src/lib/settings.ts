import { useState, useEffect } from 'react'

const KEY_QUERY_VOLUME = 'keebo:queryVolumeEnabled'

export function useQueryVolumeSetting() {
  const [enabled, setEnabledState] = useState(false)

  useEffect(() => {
    setEnabledState(localStorage.getItem(KEY_QUERY_VOLUME) === 'true')
  }, [])

  function setEnabled(value: boolean) {
    localStorage.setItem(KEY_QUERY_VOLUME, String(value))
    setEnabledState(value)
  }

  return { enabled, setEnabled }
}
