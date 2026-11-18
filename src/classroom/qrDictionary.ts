/**
 * Preset dictionary for compressing the tree code in the QR code (deflate, see stamp.ts). Trees are
 * short, so plain deflate finds few repeats; with this text "in front" of the tree, common labels,
 * words and indentation compress to a few bits each. Deflate codes nearby matches more cheaply, so
 * the most common strings come last.
 *
 * NEVER EDIT THIS TEXT: printed codes can only be read with the exact dictionary they were made
 * with. To change it, add a new one under a new format number in stamp.ts and keep this one.
 */
export const QR_DICTIONARY_1 = [
  ' PRO pro e t_k t_j <t> Op Spec ',
  '[Pron [Num [Q [QP [Deg [DegP [Mod [ModP [Asp [AspP [Perf [Prog [Pass [Foc [FocP [Top [TopP [Agr [AgrP [Cl [ClP ',
  '[Poss [PossP [Det [Aux [I [I′ [I\' [IP [S\' [S [Conj [ConjP [& [&\' [&P [Neg [NegP [Adv [AdvP [Adj [AdjP [A [A\' [AP ',
  ' John Mary Sue Bill she he it they we you I her him them his its their my your our ',
  ' a an the this that these those some every all no which who whom whose what where when why how ',
  ' is are was were be been being has have had do does did will would can could should must may might ',
  ' -s -ed -ing PRES PAST [+past] [-past] [+Q] [+wh] ',
  ' not and or but if of in on at to by for from with about into ',
  ' saw see sees seen likes like read reads book books student students dog dogs cat cats man woman ',
  ';to=v ;to=t ;to=c #wh #subj #obj #v #t #c ',
  '[P′ [P\' [P [PP [v′ [v\' [v [vP [V′ [V\' [V [VP [N′ [N\' [N [NP [D′ [D\' [D ∅] [D [DP ',
  '[C′ [C\' [C ∅] [C [CP [T′ [T\' [T ∅] [T [TP ',
  ']]\n                [',
  ']]\n            [',
  ']\n        [',
  ']\n    [',
  ']]]]]]',
  '] [DP [D the] [NP [N ',
].join('');
