module Genetic
  ( stepGeneration,
  )
where

import Data.Function (on)
import Data.List
import qualified Data.Vector as V
import System.IO
import System.Random
import Text.Printf (hPrintf)
import Types

type Bit = Int

type Chrom = [Bit]

_bitsToInt :: [Bit] -> Int
_bitsToInt = foldl (\acc bit -> 2 * acc + bit) 0

chromLength :: (Double, Double) -> Int -> Int
chromLength (a, b) p = ceiling . logBase 2 $ (b - a) * 10 ^^ p

decode :: Config -> Chrom -> Double
decode cfg chr =
  let (a, b) = domain cfg
      l = chromLen cfg
      val = fromIntegral . _bitsToInt $ chr
   in a + (val * (b - a) / (2 ^ l - 1))

calcFitness :: Config -> Double -> Double
calcFitness cfg val =
  let (a, b, c) = coeffs cfg
   in a * val ** 2 + b * val + c

genNRandomBits :: Int -> StdGen -> ([Bit], StdGen)
genNRandomBits 0 rng = ([], rng)
genNRandomBits n rng =
  let (bit, rng1) = randomR (0 :: Int, 1) rng
      (bits, rng2) = genNRandomBits (n - 1) rng1
   in (bit : bits, rng2)

genNRandomDoubles :: Int -> StdGen -> ([Double], StdGen)
genNRandomDoubles 0 rng = ([], rng)
genNRandomDoubles n rng =
  let (x, rng1) = randomR (0 :: Double, 1) rng
      (xs, rng2) = genNRandomDoubles (n - 1) rng1
   in (x : xs, rng2)

makeRandomChromo :: Config -> StdGen -> (Chrom, StdGen)
makeRandomChromo cfg rng =
  let l = chromLen cfg
      (chrm, rng_) = genNRandomBits l rng
   in (chrm, rng_)

makeIndividual :: Config -> Chrom -> Individual
makeIndividual cfg chr =
  let val = decode cfg chr
      fit = calcFitness cfg val
   in Individual chr val fit

makeRandomIndividual :: Config -> StdGen -> (Individual, StdGen)
makeRandomIndividual cfg rng =
  let (chrm, rng_) = makeRandomChromo cfg rng
      individual = makeIndividual cfg chrm
   in (individual, rng_)

_makePopulation :: Config -> Int -> StdGen -> ([Individual], StdGen)
_makePopulation _ 0 rng = ([], rng)
_makePopulation cfg n rng =
  let (individual, rng1) = makeRandomIndividual cfg rng
      (individuals, rng2) = _makePopulation cfg (n - 1) rng1
   in (individual : individuals, rng2)

makePopulation :: Config -> StdGen -> ([Individual], StdGen)
makePopulation cfg = _makePopulation cfg (popSize cfg)

-- selection probability based on fitness
calcProb :: [Individual] -> [Double]
calcProb population =
  let totalFit = sum (map fitness population)
   in map (\x -> fitness x / totalFit) population

calcCumulative :: [Double] -> [Double]
calcCumulative = scanl (+) 0.0

binarySearch :: V.Vector Double -> Double -> Int
binarySearch vect u = search 0 (V.length vect - 2)
  where
    search low high
      | low >= high = low
      | u < vect V.! mid = search low (mid - 1)
      | u >= vect V.! (mid + 1) = search (mid + 1) high
      | otherwise = mid
      where
        mid = (low + high) `div` 2

selectionFit :: Config -> [Individual] -> StdGen -> ([Individual], StdGen)
selectionFit cfg pop rng =
  let probs = calcProb pop
      q = V.fromList $ calcCumulative probs
      popV = V.fromList pop
      size = popSize cfg
      (randomN, rng_) = genNRandomDoubles (size - 1) rng
      selected = map (\u -> popV V.! binarySearch q u) randomN
   in (selected, rng_)

logSelectionStep :: Handle -> Config -> (Double, Int, Individual) -> IO ()
logSelectionStep h cfg (p, idx, i) = do
  hPrintf
    h
    "\nRandom number: %.3f. After binary search found interval with index: %d. Selecting individual:\n"
    p
    idx
  logI h cfg i

-- this is rather hacky as I do the same computation twice
-- it would be optimal to return the metadata in selectionFit (i.e, randomN, indices)
-- and here to just to the IO
selectionFitIO :: Handle -> Config -> [Individual] -> StdGen -> IO ()
selectionFitIO h cfg pop rng = do
  let probs = calcProb pop
      q = V.fromList $ calcCumulative probs
      popV = V.fromList pop
      size = popSize cfg
      (randomN, _) = genNRandomDoubles (size - 1) rng
      indices = map (binarySearch q) randomN
      selected = map (\u -> popV V.! binarySearch q u) randomN
      tossIdxSelected = zip3 randomN indices selected
  mapM_ (logSelectionStep h cfg) tossIdxSelected

selectionElite :: [Individual] -> Individual
selectionElite = maximumBy (compare `on` fitness)

_groupParents :: [a] -> ([(a, a)], [a])
_groupParents [] = ([], [])
_groupParents [x] = ([], [x])
_groupParents (x : y : xs) =
  let (pairs, left) = _groupParents xs
   in ((x, y) : pairs, left)

_chooseCross :: Config -> [Individual] -> StdGen -> ([Individual], [Individual], StdGen)
_chooseCross cfg pop rng =
  let p = crossProb cfg
      (toss, rng_) = genNRandomDoubles (length pop) rng
      (p1_, p2_) = partition (\(_, prob) -> prob < p) $ zip pop toss
      p1 = map fst p1_
      p2 = map fst p2_
   in (p1, p2, rng_)

_crossOver :: Config -> (Individual, Individual) -> StdGen -> ([Individual], Int, StdGen)
_crossOver cfg (i1, i2) rng =
  let c1 = chrom i1
      c2 = chrom i2
      l = chromLen cfg
      (k, rng_) = randomR (1 :: Int, l - 1) rng -- could set to 0, l if I wanted not to allow crossover to happen sometimes
      (c11, c12) = splitAt k c1
      (c21, c22) = splitAt k c2
      i1_ = makeIndividual cfg (c11 ++ c22)
      i2_ = makeIndividual cfg (c21 ++ c12)
   in ([i1_, i2_], k, rng_)

crossOver :: Config -> [(Individual, Individual)] -> StdGen -> ([Individual], [Int], StdGen)
crossOver _ [] rng = ([], [], rng)
crossOver cfg (x : xs) rng =
  let (l1, k, rng1) = _crossOver cfg x rng
      (l2, ks, rng2) = crossOver cfg xs rng1
   in (l1 ++ l2, k : ks, rng2)

complementBit :: Bit -> Bit
complementBit 0 = 1
complementBit 1 = 0
complementBit _ = 0

mutateC :: Config -> Chrom -> StdGen -> (Chrom, StdGen)
mutateC cfg chrm rng =
  let l = chromLen cfg
      mutP = mutProb cfg
      (probs, rng_) = genNRandomDoubles l rng
      chromProbs = zip chrm probs
      newChrom = map (\(x, p) -> if p < mutP then complementBit x else x) chromProbs
   in (newChrom, rng_)

mutateI :: Config -> Individual -> StdGen -> (Individual, StdGen)
mutateI cfg ind rng =
  let chrm = chrom ind
      (chrm_, rng_) = mutateC cfg chrm rng
      ind_ = makeIndividual cfg chrm_
   in (ind_, rng_)

mutateIs :: Config -> [Individual] -> StdGen -> ([Individual], StdGen)
mutateIs _ [] rng = ([], rng)
mutateIs cfg (x : xs) rng =
  let (x_, rng1) = mutateI cfg x rng
      (xs_, rng2) = mutateIs cfg xs rng1
   in (x_ : xs_, rng2)

maxFit :: [Individual] -> Double
maxFit pop = fitness $ selectionElite pop

averageFit :: [Individual] -> Double
averageFit pop = sum (map fitness pop) / fromIntegral (length pop)

simulateNGenerations :: Config -> Int -> [Individual] -> StdGen -> ([Individual], [(Double, Double)], StdGen)
simulateNGenerations _ 1 pop rng =
  let maxF = maxFit pop
      avgF = averageFit pop
   in (pop, [(maxF, avgF)], rng)
simulateNGenerations cfg n pop rng =
  let eliteI = selectionElite pop
      (selected, rng1) = selectionFit cfg pop rng
      (p1, p2, rng2) = _chooseCross cfg selected rng1
      (parents, rest) = _groupParents p1
      (resultCross, _, rng3) = crossOver cfg parents rng2
      resultAfterCross = p2 ++ rest ++ resultCross
      (resultAfterMutated, rng4) = mutateIs cfg resultAfterCross rng3
      newPop = eliteI : resultAfterMutated
      maxF = maxFit newPop
      avgF = averageFit newPop
      (finalPop, vals, rng_) = simulateNGenerations cfg (n - 1) newPop rng4
   in (finalPop, (maxF, avgF) : vals, rng_)

formatChrom :: Chrom -> String
formatChrom = concatMap show

logMeta :: Handle -> Config -> IO ()
logMeta h cfg = do
  let (a, b, c) = coeffs cfg
  let (s, d) = domain cfg
  hPrintf
    h
    "Polynomial: %.2f X^2 + %.2f X + %.2f\n"
    a
    b
    c
  hPrintf
    h
    "Search interval [%.2f, %.2f]\n"
    s
    d
  hPrintf
    h
    "Precision %d, Chromosome Length: %d\n\n"
    (precision cfg)
    (chromLen cfg)

logI :: Handle -> Config -> Individual -> IO ()
logI h cfg ind = do
  hPrintf
    h
    "Chrom: %s | Val: %7.*f | Fit: %7.*f\n"
    (formatChrom $ chrom ind)
    (precision cfg)
    (trueVal ind)
    (precision cfg)
    (fitness ind)

logP :: Handle -> Config -> [Individual] -> IO ()
logP h cfg pop = do
  mapM_ (logI h cfg) pop

logIProb :: Handle -> (Individual, Double) -> IO ()
logIProb h (i, p) = do
  hPrintf h "Chrom: %s, Probability: %5.3f%%\n" (formatChrom $ chrom i) (p * 100)

logProbs :: Handle -> [Individual] -> IO ()
logProbs h pop = do
  let ps = calcProb pop
  mapM_ (logIProb h) (zip pop ps)

_makeIntervals :: [a] -> [(a, a)]
_makeIntervals [] = []
_makeIntervals [_] = []
_makeIntervals (x : y : xs) = (x, y) : _makeIntervals (y : xs)

_logInterval :: Handle -> (Int, (Double, Double)) -> IO ()
_logInterval h (idx, (l, r)) = do
  hPrintf h "Interval %d: [%5.3f, %5.3f)\n" idx l r

logIntervals :: Handle -> [Individual] -> IO ()
logIntervals h pop = do
  let ps = calcProb pop
      cumulative = calcCumulative ps
      intervals = zip [1 ..] (_makeIntervals cumulative)
  mapM_ (_logInterval h) intervals

logPair :: Handle -> ((Individual, Individual), Int) -> IO ()
logPair h ((i1, i2), k) = do
  hPrintf
    h
    "(%s, %s) | Crossover point: %d\n"
    (formatChrom $ chrom i1)
    (formatChrom $ chrom i2)
    k

logFits :: Handle -> Config -> (Int, (Double, Double)) -> IO ()
logFits h cfg (idx, (m, a)) = do
  hPrintf
    h
    "The statistics after generation %2d are: Max Fitness = %.*f, Average Fitness = %.*f.\n"
    idx
    (precision cfg)
    m
    (precision cfg)
    a

--- main function of the module
stepGeneration :: Config -> [Individual] -> StdGen -> (NextGenResponse, StdGen)
stepGeneration cfg pop rng =
  let maxF = maxFit pop
      avgF = averageFit pop
      -- begin selection
      elite = selectionElite pop
      (popSelected, rng1) = selectionFit cfg pop rng
      (parents, r1, rng2) = _chooseCross cfg popSelected rng1
      (parentsP, r2) = _groupParents parents
      (popCross, _, rng3) = crossOver cfg parentsP rng2
      combinedAfterCross = r1 ++ r2 ++ popCross
      (popMut, rng4) = mutateIs cfg combinedAfterCross rng3
      finalPop = elite : popMut
      stat = GenerationStats {maxFitVal = maxF, avgFitVal = avgF, logs = [""]}
      (seedInt, finalRng) = random rng4
      result = NextGenResponse {nextPop = finalPop, stats = stat, nextSeed = seedInt}
   in (result, finalRng)
