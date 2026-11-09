# Independent numerical references

`normal-reference.js` contains comparison data, not an implementation. Neither
`normal-cdf.js` nor `numerical-methods.js` imports it. No external library runs
on the website, and no package dependency was added to this project.

The normal CDF identities and error-function definitions are from
[NIST DLMF §7.2](https://dlmf.nist.gov/7.2); the series is given in
[§7.6](https://dlmf.nist.gov/7.6). The
[NIST standard-normal table](https://itl.nist.gov/div898/handbook/eda/section3/eda3671.htm)
publishes **areas from zero to z, rounded to five decimal places**. The five
`NIST_AREAS` entries are transcribed from its rows 0.5, 1.0, 1.5/column 0.03,
2.0 and 3.0. They validate five-decimal table agreement, not 15-digit accuracy.
[Wolfram MathWorld](https://mathworld.wolfram.com/NormalDistribution.html)
independently documents the density/CDF and erf relationship.

The longer decimal values were computed offline on 9 November 2026 with
**mpmath 1.3.0 at 80 decimal digits**, then stored to 45 significant digits.
They are not numbers printed in the NIST five-place table. For each stored x,
`erfc(-x/sqrt(2))/2` was independently checked against high-precision integration
of the Gaussian density from negative infinity to x, agreeing to at least
65 relative decimal places. The positive complementary tail is computed by
`erfc(x/sqrt(2))/2`, rather than subtraction from one. See the
[mpmath error-function documentation](https://mpmath.org/doc/1.3.0/functions/expintegrals.html#erfc).

Reproduction, in an optional isolated verification environment with mpmath 1.3.0:

```python
import mpmath as mp
mp.mp.dps = 80
x = mp.mpf('-8')                 # Repeat for the stored decimal x values.
cdf = mp.erfc(-x/mp.sqrt(2))/2
check = mp.quad(lambda t: mp.exp(-t*t/2)/mp.sqrt(2*mp.pi), [-mp.inf, x])
assert mp.almosteq(cdf, check, rel_eps=mp.mpf('1e-65'), abs_eps=mp.mpf('0'))
print(mp.nstr(cdf, 45))
```

This separate reference calculation does not supply the submitted JavaScript
algorithm. Browser errors compare against these decimal strings converted to
IEEE-754 Numbers. A displayed error of zero means agreement with that rounded
reference; it does not assert an exact real-number result.

For Exercise 1, the exact elementary integrals are derived on the page.
The sinc reference is `Si(pi) = 1.851937051982466170361053370157991363345809728981…`,
independently checked with `mp.si(mp.pi)` and `mp.quad(mp.sinc,[0,mp.pi])`
at 80 decimal digits. The sine integral is defined in
[NIST DLMF §6.2.9](https://dlmf.nist.gov/6.2.E9). The JavaScript object stores
the nearest double-precision reference, without claiming an elementary value.
