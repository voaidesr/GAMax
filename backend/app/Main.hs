{-# LANGUAGE OverloadedStrings #-}

module Main where

import Genetic (initConfig, initPop, stepGeneration)
import Network.Wai.Handler.Warp (run)
import Network.Wai.Middleware.Cors (simpleCors)
import Servant
import System.Random
import Types

geneticAPI :: Proxy GeneticAPI
geneticAPI = Proxy

server :: Server GeneticAPI
server = handleInitConfig :<|> handleInitPop :<|> handleNextGen
  where
    handleInitConfig :: InitConfigRequest -> Handler Config
    handleInitConfig req =
      let cfg =
            initConfig
              (popSz req)
              (dom req)
              (coef req)
              (prec req)
              (crossP req)
              (mutP req)
       in return cfg

    handleInitPop :: InitPopRequest -> Handler InitPopResponse
    handleInitPop req = do
      let gen = mkStdGen (initSeed req)
      let (response, _) = initPop (initCfg req) gen
      return response

    handleNextGen :: NextGenRequest -> Handler NextGenResponse
    handleNextGen req = do
      let gen = mkStdGen (reqSeed req)
      let (response, _) = stepGeneration (reqConfig req) (reqPop req) gen
      return response

main :: IO ()
main = do
  putStrLn "Starting Servant Genetic Algorithm Server on port 8080..."
  run 8080 (simpleCors (serve geneticAPI server))
