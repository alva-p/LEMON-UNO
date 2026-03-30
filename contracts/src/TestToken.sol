// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @dev Token de prueba — SOLO para tests y testnet.
 *      MED-04: mint restringido al owner para evitar que cualquiera minteé
 *      tokens arbitrarios si el contrato llegase a deployarse accidentalmente.
 *      NO deployar en mainnet.
 */
contract TestToken is ERC20, Ownable {
    constructor(string memory name, string memory symbol, uint256 initialSupply)
        ERC20(name, symbol)
        Ownable(msg.sender)
    {
        if (initialSupply > 0) _mint(msg.sender, initialSupply);
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
