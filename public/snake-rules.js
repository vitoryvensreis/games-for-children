/* Lógica de travessia das bordas, compartilhada pelo jogo e testes. */
(function(root){
 function nextSnakeCell(head,direction,cols,rows){
  if(!Number.isInteger(cols)||cols<1||!Number.isInteger(rows)||rows<1)throw Error('Tabuleiro inválido');
  return {x:((head.x+direction.x)%cols+cols)%cols,y:((head.y+direction.y)%rows+rows)%rows};
 }
 if(typeof module!=='undefined'&&module.exports)module.exports={nextSnakeCell};
 if(root)root.nextSnakeCell=nextSnakeCell;
})(typeof window!=='undefined'?window:null);
