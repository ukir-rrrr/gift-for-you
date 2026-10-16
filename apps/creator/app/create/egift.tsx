import { LIMITS } from '@gfy/schema'
import { Body, Choice, Field, Notice, Screen, StepFooter, StepHeader } from '../../src/components/ui'
import { assessEgift, type EgiftDraft } from '../../src/lib/draft'
import { useApp } from '../../src/state/app'

/** F2-05 (e-gift) and F2-13 (passphrase). URLs must be https; shorteners are refused; off-list domains need a check. */
export default function EgiftStep() {
  const { draft, dispatch } = useApp()
  const egift = draft.egift
  const set = (next: EgiftDraft) => dispatch({ type: 'egift', egift: next })
  const assessment = assessEgift(egift)
  return (
    <Screen footer={<StepFooter step="egift" next="/create/preview" />} testID="step-egift">
      <StepHeader step="egift" />
      <Body>手紙のあとに受け取れるeギフトを付けられます（なくてもかまいません）。</Body>
      <Choice title="付けない" selected={egift.kind === 'none'} onPress={() => set({ kind: 'none' })} testID="egift-none" />
      <Choice
        title="URLで渡す"
        detail="https:// で始まるeギフトのURL"
        selected={egift.kind === 'url'}
        onPress={() => set({ kind: 'url', url: egift.kind === 'url' ? egift.url : '', acceptOffList: false })}
        testID="egift-url"
      />
      <Choice
        title="コードで渡す"
        detail="ギフトコードや引換番号"
        selected={egift.kind === 'code'}
        onPress={() => set({ kind: 'code', code: egift.kind === 'code' ? egift.code : '' })}
        testID="egift-code"
      />
      {egift.kind === 'url' ? (
        <>
          <Field
            label="eギフトのURL"
            value={egift.url}
            placeholder="https://giftee.com/..."
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            onChange={(url) => set({ kind: 'url', url, acceptOffList: false })}
            testID="egift-url-input"
          />
          {assessment.status === 'ok' && assessment.domain ? (
            <Notice tone="ok" testID="egift-ok">
              {`${assessment.domain} は確認済みのサイトです`}
            </Notice>
          ) : null}
          {assessment.status === 'block' && egift.url ? <Notice tone="error" testID="egift-block">{assessment.message}</Notice> : null}
          {assessment.status === 'warn' ? (
            <>
              <Notice tone="warn" testID="egift-warn">
                {`${assessment.domain} は確認リストにないサイトです。受け取る人にも注意が表示されます。`}
              </Notice>
              <Choice
                title="このサイトで間違いありません"
                selected={egift.acceptOffList}
                onPress={() => set({ ...egift, acceptOffList: !egift.acceptOffList })}
                testID="egift-accept"
              />
            </>
          ) : null}
        </>
      ) : null}
      {egift.kind === 'code' ? (
        <Field
          label="ギフトコード"
          value={egift.code}
          max={LIMITS.egiftCode}
          autoCapitalize="characters"
          autoCorrect={false}
          onChange={(code) => set({ kind: 'code', code })}
          testID="egift-code-input"
        />
      ) : null}
      {egift.kind !== 'none' ? (
        <>
          <Field
            label="合言葉（任意）"
            value={draft.passphrase}
            max={LIMITS.passphraseMax}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="ふたりだけが知っている言葉"
            onChange={(passphrase) => dispatch({ type: 'passphrase', passphrase })}
            testID="passphrase"
          />
          <Body muted>合言葉を入れると、受け取る人は合言葉を入れるまでeギフトを開けません。リンクが他の人に渡ったときの備えです。</Body>
        </>
      ) : null}
    </Screen>
  )
}
