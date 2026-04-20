{-# LANGUAGE DataKinds #-}
{-# LANGUAGE DeriveAnyClass #-}
{-# LANGUAGE DeriveGeneric #-}
{-# LANGUAGE TypeOperators #-}

module Types where

import Data.Aeson (FromJSON, ToJSON)
import GHC.Generics (Generic)
import Servant
import System.Random (StdGen)

data Config = Config
  { popSize :: Int,
    domain :: (Double, Double),
    coeffs :: (Double, Double, Double),
    precision :: Int,
    crossProb :: Double,
    mutProb :: Double,
    chromLen :: Int
  }
  deriving (Show, Eq, Generic, ToJSON, FromJSON)

data Individual = Individual
  { chrom :: [Int],
    trueVal :: Double,
    fitness :: Double
  }
  deriving (Show, Eq, Generic, ToJSON, FromJSON)

data InitConfigRequest = InitConfigRequest
  { popSz :: Int,
    dom :: (Double, Double),
    coef :: (Double, Double, Double),
    prec :: Int,
    crossP :: Double,
    mutP :: Double
  }
  deriving (Show, Eq, Generic, ToJSON, FromJSON)

data InitPopRequest = InitPopRequest
  { initCfg :: Config,
    initSeed :: Int
  }
  deriving (Show, Eq, Generic, ToJSON, FromJSON)

data InitPopResponse = InitPopResponse
  { resultPop :: [Individual],
    afterSeed :: Int
  }
  deriving (Show, Eq, Generic, ToJSON, FromJSON)

data NextGenRequest = NextGenRequest
  { reqConfig :: Config,
    reqPop :: [Individual],
    reqSeed :: Int
  }
  deriving (Show, Generic, FromJSON)

data GenerationStats = GenerationStats
  { maxFitVal :: Double,
    avgFitVal :: Double,
    logs :: [String]
  }
  deriving (Show, Generic, ToJSON)

data NextGenResponse = NextGenResponse
  { nextPop :: [Individual],
    stats :: GenerationStats,
    nextSeed :: Int
  }
  deriving (Show, Generic, ToJSON)

type GeneticAPI =
  "api"
    :> "init_config"
    :> ReqBody '[JSON] InitConfigRequest
    :> Post '[JSON] Config
    :<|> "api"
      :> "init_population"
      :> ReqBody '[JSON] InitPopRequest
      :> Post '[JSON] InitPopResponse
    :<|> "api"
      :> "next_generation"
      :> ReqBody '[JSON] NextGenRequest
      :> Post '[JSON] NextGenResponse
