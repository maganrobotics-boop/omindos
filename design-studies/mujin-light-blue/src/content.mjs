export const image=(file)=>`https://framerusercontent.com/images/${file}`;
export const media={
 logo:image('LFBgjJehGie7jP9j4fRM9FjSg.svg'),logoWhite:image('qIwV5KGJYVQT0IIzX0fblDrtktk.svg'),
 heroVideo:'https://framerusercontent.com/assets/yfTlArSHXGW6DkOtpruZ8cy5yA.mp4',
 factory:image('QIyMoyaiQikLrInqeHSNryHPFDA.jpg?scale-down-to=2048'),
 platform:image('iqvO0UVYiUC6kQNUq5VJWMMiw.jpg?scale-down-to=2048'),
 phone:image('7Lfxsja3fM8yjOa5kuweEoKKcc4.jpg?scale-down-to=1024'),
 screen:image('Du51lkbgc6VGAMB2fYk9D2kgYs.png?scale-down-to=1024'),
 cell:image('xeSTfzlZQSD57rP25vE2hZXdH8U.png?scale-down-to=1024'),
 architecture:image('zzMOsHDnlIPpDSEcuGNpe248mEY.png?scale-down-to=2048'),
 news:image('yxUDyzVPRrCuxu79CWQsSkm1y7o.jpg?scale-down-to=1024'),
 case:image('5FvG2c9ARuh6Pw2uVgdF7HQDtQ.jpg?scale-down-to=1024'),
 videos:image('HZ6iNUEphJ9gyTPI46HjXaW4ECk.jpg?scale-down-to=1024'),
 events:image('SpFbNwnfgRdWER5kOOJc7m37j4Q.jpeg'),
 integrator:image('FPq3neiMpnQDEjLnQLJ4RykeM.jpg?scale-down-to=2048'),
 company:image('ooUBR3kXy10gkLHd7yxIScbHU.png?scale-down-to=1024')
};
export const applications=[
 {slug:'palletizing',name:'Palletizing',image:image('5gYzPlfZEYiCSNmpd0sXHNDWo.jpg?scale-down-to=1024'),hero:image('6U7jxu6yZ2ZlTtKKwmOfwWOt3Q.png'),detail:image('oeMptEtDTmdEzMrLjfpjxLWEo.png'),title:'AI-Driven Palletizing for High-Mix, High-Throughput Operations',summary:'Build stable pallets while adapting to different cartons, order mixes and operating conditions.',features:['Respond to changing product mixes','Plan placement from live observations','Coordinate picking and stacking','Connect the cell with upstream equipment'],video:'https://www.youtube.com/watch?v=Y2zgRF4HdCg'},
 {slug:'depalletizing',name:'Depalletizing',image:image('SpJiRXuXyzdxMf2QjfqubxCPM.jpg?scale-down-to=1024'),title:'Intelligent depalletizing for changing loads',summary:'Identify and remove cases from incoming pallets, with robot motion responding to the load in front of it.',features:['Identify cases and their positions','Plan collision-aware movement','Handle varied pallet arrangements','Link inbound flow to downstream processes']},
 {slug:'mixed-case-fulfillment',name:'Mixed-Case Fulfillment',image:image('5vWKUSsdlg4x85ZSvAnP3YrQsA.png?scale-down-to=1024'),title:'Mixed-case fulfillment, coordinated by software',summary:'Bring case selection and pallet building together for orders containing many different products.',features:['Coordinate order preparation','Combine products into stable loads','Respond to variable demand','Connect picking and palletizing']},
 {slug:'bin-picking',name:'Bin Picking',image:image('P16cP1ID3Ikkfl7C6Z4a5H6Yo7c.jpg'),title:'Robotic picking for unstructured bins',summary:'Use perception and motion planning to select parts from bins with changing positions and orientations.',features:['Locate parts within the bin','Select a suitable grasp','Plan access around surrounding parts','Feed manufacturing operations']},
 {slug:'piece-picking',name:'Piece Picking',image:image('lb9g1oNtzyQDS884W3anqx3OkyA.png?scale-down-to=1024'),title:'Piece picking for dynamic fulfillment',summary:'Coordinate item recognition, grasping and placement as the assortment and order requirements change.',features:['Recognize individual products','Adapt the picking approach','Coordinate fulfillment steps','Support changing assortments']},
 {slug:'amr-agv-fleet-manager',name:'Fleet Coordination',image:image('RSzu0lqzyWy7dnRb5TJNnZ4Gtg.png?scale-down-to=1024'),title:'Connect your mobile robot fleet',summary:'Coordinate AMRs and AGVs through a shared fleet-management layer.',features:['Connect different mobile platforms','Assign transport work','Coordinate routes and traffic','Connect fleet activity to operations']},
 {slug:'truck-trailer-unloading',name:'TruckBot',image:media.factory,title:'Robotic trailer unloading with TruckBot',summary:'Explore robotic unloading at the beginning of the warehouse material flow.',features:['Unload incoming trailers','Link unloading and conveying','Coordinate perception and movement','Connect to the inbound workflow']}
];
export const industries=[
 {slug:'retail',name:'Retail',image:image('tvWTTR6lK5ls1OGcVPHLWKvLgw.jpeg?scale-down-to=1024'),summary:'Coordinate product handling from incoming inventory to store-bound orders.'},
 {slug:'manufacturing',name:'Manufacturing',image:image('SpFbNwnfgRdWER5kOOJc7m37j4Q.jpeg'),summary:'Connect robotic handling with changing parts, equipment and production workflows.'},
 {slug:'e-commerce',name:'E-commerce',image:image('Q8YceYGj3fta9HrqXXzZ2NhF1Y.jpg'),summary:'Bring picking and fulfillment into a connected automation workflow.'},
 {slug:'food-and-beverage',name:'Food & Beverage',image:image('P4D8t5aEXoh03dsiE3D1NZvgmf8.jpg'),summary:'Explore case handling and pallet preparation for food and beverage operations.'},
 {slug:'cpg',name:'CPG',image:image('Po9NJaDfh7MjpKNhhAJVRGvfYFA.jpg?scale-down-to=1024'),summary:'Link inbound handling and outbound preparation across consumer product operations.'},
 {slug:'3pl',name:'3PL',image:image('d7ph75igdPfFcRiioBqYKlKc.webp'),summary:'Adapt automation workflows to the products and requirements of different customers.'}
];
export const categories=[['news','News',media.news],['blog','Blog',media.phone],['case-studies','Case Studies',media.case],['events','Events',media.events],['videos','Videos',media.videos]];
export const benefits=[['Deploy Rapidly','Connect robot capabilities and configure work through a shared software environment.'],['Optimize Spend','Reduce the amount of custom integration and repeated programming in an automation project.'],['Configure Dynamically','Adjust work through a visual interface that connects perception, motion and process logic.'],['Scale Faster','Carry a common control approach from one robotic cell to larger connected operations.']];
export const partners=['Qo3cyP3UFTzoB1mpdtiMNhJ81c.png','dkYO1J0DrVSIa7Kx260zLnYjI.png','y2xdonnyITZbEh7fnmanBNdbTM.png','KdMf9EKiDQl8kj9KKqKkekVk9bU.png','nFUytMU3i68YUPod2Mzi5DOY1T8.png','rQislDib6HZVQfMiLoR0xZFcws.png','U5LGszvnbrsJkvrOZFEbLvZEOuM.png','qzNfCeTDsD7wCdr4l09G8htfBXs.png','yxu7mtHv9WRLXO7bcsvsNFqAqE.png'];
