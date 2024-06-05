# token_programs_metacrafters
A simple smart contract that stakes a user token and unstake a user token.
# Description

This is a Solana smart contrat using Anchor framework to implement a simple token staking program. The program uses a pda as a signer to create the locked account for the user to recored the staked tokens. the signer pda is also used to unstake the user tokens. A CPI is used to create new accounts and transfer tokens.
# Getting Started
# Installing

follow the installation process in this guide to set up solana and anchor https://www.anchor-lang.com/docs/installation
# Executing program

just run the following command to test the program 
anchor test

# Authors

Ajayi Damola Ramon
# License
This project is licensed under the MIT License - see the LICENSE.md file for details
